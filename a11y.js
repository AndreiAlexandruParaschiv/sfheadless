#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const { XMLParser } = require('fast-xml-parser');
const zlib = require('zlib');
const { URL } = require('url');

// Load configuration from config.json
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Get the website URL from command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Please provide a website URL to audit for accessibility.');
  console.error('Usage: node a11y.js <website-url>');
  process.exit(1);
}

const websiteUrl = args[0];
console.log(`Starting accessibility audit for: ${websiteUrl}`);

// Extract base URL without trailing slash
const baseUrl = websiteUrl.replace(/\/$/, '');
const urlObj = new URL(baseUrl);
const domain = urlObj.hostname;
const domainName = domain.replace(/^www\./, '').replace(/\./g, '_');

// WCAG Standards to check (you can modify this list as needed)
const WCAG_STANDARDS = [
  'WCAG 2.0 A:All Violations',
  'WCAG 2.0 AA:All Violations',
  'WCAG 2.0 AAA:All Violations',
  'WCAG 2.1 AA:All Violations',
];

// Main function to run the accessibility audit
async function main() {
  try {
    // Step 1: Create output directory
    const OUTPUT_FOLDER = createOutputFolder();

    // Step 2: Find sitemap URL
    const sitemapUrl = await findSitemapUrl(baseUrl);

    if (!sitemapUrl) {
      console.error('Could not find a sitemap for this domain.');
      process.exit(1);
    }

    // Step 3: Create a temporary crawl list file with URLs from the sitemap
    const listPath = await createUrlListFromSitemap(sitemapUrl, OUTPUT_FOLDER);

    if (!listPath) {
      console.error('Could not extract URLs from sitemap.');
      process.exit(1);
    }

    // Step 4: Run Screaming Frog accessibility audit
    await runAccessibilityAudit(listPath, OUTPUT_FOLDER);

    // Step 5: Process and summarize results
    processSummaryReport(OUTPUT_FOLDER);

    console.log(`Accessibility audit completed successfully for ${domain}!`);
    console.log(`Results are available in: ${OUTPUT_FOLDER}`);
  } catch (error) {
    console.error('Error during accessibility audit:', error.message);
    process.exit(1);
  }
}

// Function to create output folder
function createOutputFolder() {
  const OUTPUT_FOLDER = path.resolve(
    process.cwd(),
    `./results/a11y/a11y_${domainName}`
  );

  if (!fs.existsSync(path.dirname(OUTPUT_FOLDER))) {
    fs.mkdirSync(path.dirname(OUTPUT_FOLDER), { recursive: true });
    console.log(
      `Created parent output directory: ${path.dirname(OUTPUT_FOLDER)}`
    );
  }

  if (!fs.existsSync(OUTPUT_FOLDER)) {
    fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_FOLDER}`);
  } else {
    console.log(`Using existing output directory: ${OUTPUT_FOLDER}`);
  }

  return OUTPUT_FOLDER;
}

// Function to find sitemap URL
async function findSitemapUrl(baseUrl) {
  console.log(`Looking for sitemap for domain: ${domain}`);

  // First, try robots.txt
  try {
    const robotsTxtUrl = `${baseUrl}/robots.txt`;
    console.log(`Checking ${robotsTxtUrl} for sitemap declarations...`);

    const robotsTxt = await fetchWithRetry(robotsTxtUrl);
    const sitemapMatches = robotsTxt.match(
      /Sitemap:\s*(https?:\/\/[^\s\n\r]+)/gi
    );

    if (sitemapMatches && sitemapMatches.length > 0) {
      const sitemapUrl = sitemapMatches[0].replace(/Sitemap:\s*/i, '').trim();
      console.log(`Found sitemap in robots.txt: ${sitemapUrl}`);
      return sitemapUrl;
    }
  } catch (error) {
    console.log(`Could not fetch robots.txt: ${error.message}`);
  }

  // If not found in robots.txt, try common sitemap locations
  const commonSitemapPaths = [
    '/sitemap.xml',
    '/sitemap_index.xml',
    '/sitemap.php',
    '/sitemap.txt',
  ];

  for (const sitemapPath of commonSitemapPaths) {
    const sitemapUrl = `${baseUrl}${sitemapPath}`;
    try {
      console.log(`Checking for sitemap at: ${sitemapUrl}`);
      await fetchWithRetry(sitemapUrl, 5000); // Short timeout to check existence
      console.log(`Found sitemap at: ${sitemapUrl}`);
      return sitemapUrl;
    } catch (error) {
      console.log(`No sitemap found at ${sitemapUrl}`);
    }
  }

  // If we couldn't find a sitemap, return the default path anyway
  console.log('No sitemap found. Using default sitemap.xml path.');
  return `${baseUrl}/sitemap.xml`;
}

// Function to extract URLs from sitemap and create a list file
async function createUrlListFromSitemap(sitemapUrl, outputFolder) {
  try {
    console.log(`Fetching sitemap from: ${sitemapUrl}`);
    const sitemapContent = await fetchWithRetry(sitemapUrl);

    // Try to parse the XML
    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });
      const parsed = parser.parse(sitemapContent);

      let urls = [];

      // Check if it's a sitemap index
      if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
        console.log(
          'This is a sitemap index file containing multiple sitemaps'
        );

        const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
          ? parsed.sitemapindex.sitemap
          : [parsed.sitemapindex.sitemap];

        // Only process the first few sitemaps to avoid long processing times
        const maxSitemaps = Math.min(3, sitemaps.length);
        console.log(
          `Processing ${maxSitemaps} out of ${sitemaps.length} child sitemaps`
        );

        for (let i = 0; i < maxSitemaps; i++) {
          const childUrl = sitemaps[i].loc;
          console.log(`Fetching child sitemap: ${childUrl}`);

          try {
            const childContent = await fetchWithRetry(childUrl);
            const childParsed = parser.parse(childContent);

            if (childParsed.urlset && childParsed.urlset.url) {
              const childUrls = Array.isArray(childParsed.urlset.url)
                ? childParsed.urlset.url
                : [childParsed.urlset.url];

              childUrls.forEach((url) => {
                if (url.loc) {
                  urls.push(url.loc);
                }
              });
            }
          } catch (childError) {
            console.error(
              `Error processing child sitemap ${childUrl}: ${childError.message}`
            );
          }
        }
      }
      // Regular sitemap
      else if (parsed.urlset && parsed.urlset.url) {
        console.log('This is a regular sitemap file');

        const sitemapUrls = Array.isArray(parsed.urlset.url)
          ? parsed.urlset.url
          : [parsed.urlset.url];

        sitemapUrls.forEach((url) => {
          if (url.loc) {
            urls.push(url.loc);
          }
        });
      } else {
        console.warn('Could not determine sitemap type from XML structure');
      }

      if (urls.length === 0) {
        console.warn('No URLs found in sitemap');
        return null;
      }

      // Limit the number of URLs to process to avoid overwhelming the system
      const maxUrls = Math.min(50, urls.length);
      urls = urls.slice(0, maxUrls);

      console.log(
        `Found ${urls.length} URLs in sitemap${
          maxUrls < urls.length ? ' (limited to 50)' : ''
        }`
      );

      // Create a temporary file with the URLs
      const listFilePath = path.join(outputFolder, 'url_list.csv');
      fs.writeFileSync(listFilePath, urls.join('\n'));

      console.log(`Created URL list file at: ${listFilePath}`);
      return listFilePath;
    } catch (parseError) {
      console.error(`Error parsing sitemap XML: ${parseError.message}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching sitemap: ${error.message}`);
    return null;
  }
}

// Function to run accessibility audit using Screaming Frog
async function runAccessibilityAudit(listPath, outputFolder) {
  // Ensure list file exists
  if (!fs.existsSync(listPath)) {
    throw new Error(`URL list file not found: ${listPath}`);
  }

  console.log('Starting Screaming Frog accessibility audit...');

  // Create audit timestamp
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];

  // For each WCAG standard, run a separate audit
  for (const standard of WCAG_STANDARDS) {
    const standardFolder = path.join(
      outputFolder,
      standard.replace(/:/g, '_').replace(/\s/g, '_')
    );

    if (!fs.existsSync(standardFolder)) {
      fs.mkdirSync(standardFolder, { recursive: true });
    }

    // Build the command for this WCAG standard
    const command = `"${config.screamingFrogPath}" --headless --crawl-list "${listPath}" --bulk-export "Accessibility:${standard}" --output-folder "${standardFolder}" --overwrite --export-format csv`;

    console.log(`Running audit for ${standard}...`);
    console.log(`Command: ${command}`);

    try {
      // Execute the command
      execSync(command, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      console.log(`Completed audit for ${standard}`);

      // Check if files were created
      const files = fs
        .readdirSync(standardFolder)
        .filter((file) => !file.startsWith('.'));
      console.log(`Generated ${files.length} files for ${standard}`);

      if (files.length > 0) {
        console.log('Generated files:');
        files.forEach((file) => console.log(`- ${file}`));
      } else {
        console.log(
          'No files were generated. This could mean no violations were found or there was an error.'
        );
      }
    } catch (error) {
      console.error(
        `Error during accessibility audit for ${standard}: ${error.message}`
      );
      // Continue with other standards even if one fails
    }
  }
}

// Function to process and create summary report
function processSummaryReport(outputFolder) {
  const summaryFile = path.join(outputFolder, 'accessibility_summary.html');
  const violationData = {};

  // Process each WCAG standard export
  for (const standard of WCAG_STANDARDS) {
    const standardFolder = path.join(
      outputFolder,
      standard.replace(/:/g, '_').replace(/\s/g, '_')
    );
    const standardKey = standard.split(':')[0]; // e.g., "WCAG 2.0 A"

    if (!fs.existsSync(standardFolder)) {
      violationData[standardKey] = {
        count: 0,
        details: [],
        error: 'Folder not found',
      };
      continue;
    }

    // Find the violations CSV file
    const violationFiles = fs
      .readdirSync(standardFolder)
      .filter(
        (file) =>
          file.endsWith('.csv') && file.toLowerCase().includes('violation')
      );

    if (violationFiles.length === 0) {
      violationData[standardKey] = {
        count: 0,
        details: [],
        error: 'No violation file found',
      };
      continue;
    }

    // Read the violations file
    const violationFile = path.join(standardFolder, violationFiles[0]);
    let violationContent;

    try {
      violationContent = fs.readFileSync(violationFile, 'utf8');
    } catch (error) {
      violationData[standardKey] = {
        count: 0,
        details: [],
        error: `Error reading file: ${error.message}`,
      };
      continue;
    }

    // Parse CSV content
    const lines = violationContent.split('\n');
    const headers = lines[0].split(',');
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      const values = lines[i].split(',');
      const row = {};

      headers.forEach((header, index) => {
        row[header.trim()] = values[index] ? values[index].trim() : '';
      });

      data.push(row);
    }

    // Group violations by type
    const violationTypes = {};
    data.forEach((row) => {
      const violationType = row['Violation Type'] || 'Unknown';
      if (!violationTypes[violationType]) {
        violationTypes[violationType] = 0;
      }
      violationTypes[violationType]++;
    });

    violationData[standardKey] = {
      count: data.length,
      types: violationTypes,
      details: data,
    };
  }

  // Generate HTML summary report
  const html = generateHtmlSummary(violationData, domain);
  fs.writeFileSync(summaryFile, html);

  console.log(`Generated accessibility summary report: ${summaryFile}`);
}

// Function to generate HTML summary
function generateHtmlSummary(violationData, domain) {
  // Count total violations
  let totalViolations = 0;
  Object.values(violationData).forEach((data) => {
    if (data.count) totalViolations += data.count;
  });

  // Generate HTML
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Audit Summary for ${domain}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3 {
      color: #2c3e50;
    }
    .summary-box {
      background-color: #f8f9fa;
      border-radius: 5px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .summary-stat {
      font-size: 24px;
      font-weight: bold;
      color: #e74c3c;
    }
    .standard-section {
      margin-bottom: 30px;
      border-bottom: 1px solid #eee;
      padding-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      padding: 10px;
      border: 1px solid #ddd;
      text-align: left;
    }
    th {
      background-color: #f2f2f2;
    }
    .violation-type {
      font-weight: bold;
    }
    .severity-high {
      color: #e74c3c;
    }
    .severity-medium {
      color: #f39c12;
    }
    .severity-low {
      color: #3498db;
    }
    .chart-container {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      margin-bottom: 30px;
    }
    .chart {
      flex: 1;
      min-width: 300px;
      height: 300px;
      background-color: #f8f9fa;
      padding: 10px;
      border-radius: 5px;
    }
  </style>
</head>
<body>
  <h1>Accessibility Audit Summary for ${domain}</h1>
  <p>Report generated on ${new Date().toLocaleString()}</p>
  
  <div class="summary-box">
    <h2>Overview</h2>
    <p>Total Accessibility Violations: <span class="summary-stat">${totalViolations}</span></p>
    <p>This report summarizes accessibility violations found according to various WCAG standards.</p>
  </div>
  
  <div class="chart-container">
    <div class="chart">
      <h3>Violations by Standard</h3>
      <p><em>Chart data visualization would appear here in a real implementation</em></p>
      <ul>
        ${Object.entries(violationData)
          .map(
            ([standard, data]) =>
              `<li>${standard}: ${data.count || 0} violations</li>`
          )
          .join('')}
      </ul>
    </div>
  </div>
  
  ${Object.entries(violationData)
    .map(
      ([standard, data]) => `
    <div class="standard-section">
      <h2>${standard} Audit Results</h2>
      ${
        data.error
          ? `<p>Error: ${data.error}</p>`
          : data.count === 0
          ? `<p>No violations found for this standard.</p>`
          : `
            <p>Total violations: ${data.count}</p>
            <h3>Violation Types:</h3>
            <table>
              <tr>
                <th>Violation Type</th>
                <th>Count</th>
              </tr>
              ${Object.entries(data.types || {})
                .map(
                  ([type, count]) => `
                  <tr>
                    <td class="violation-type">${type}</td>
                    <td>${count}</td>
                  </tr>
                `
                )
                .join('')}
            </table>
            <p>See the detailed export files for more information about each violation.</p>
          `
      }
    </div>
  `
    )
    .join('')}
  
  <div class="summary-box">
    <h2>Next Steps</h2>
    <p>To improve accessibility compliance:</p>
    <ul>
      <li>Address high-severity violations first</li>
      <li>Focus on violations that appear across multiple pages</li>
      <li>Implement fixes following WCAG guidelines</li>
      <li>Re-run the audit after making changes to verify improvements</li>
    </ul>
  </div>
  
  <footer>
    <p><small>Generated using Screaming Frog SEO Spider and Node.js</small></p>
  </footer>
</body>
</html>
  `;
}

// Helper function to fetch content with retry and decompression
async function fetchWithRetry(url, timeout = 10000, maxRetries = 3) {
  let retries = 0;
  let lastError;

  while (retries < maxRetries) {
    try {
      return await fetchUrl(url, timeout);
    } catch (error) {
      lastError = error;
      retries++;
      console.log(
        `Retry ${retries}/${maxRetries} for ${url}: ${error.message}`
      );

      // Wait before retrying (increasing backoff)
      await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
    }
  }

  throw (
    lastError || new Error(`Failed to fetch ${url} after ${maxRetries} retries`)
  );
}

// Basic fetch function with timeout
async function fetchUrl(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = url.startsWith('https:') ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
        'Accept-Encoding': 'gzip, deflate',
      },
      timeout: timeout,
    };

    const req = client.request(options, (res) => {
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        // Handle redirects
        return resolve(
          fetchUrl(new URL(res.headers.location, url).href, timeout)
        );
      }

      if (res.statusCode !== 200) {
        return reject(
          new Error(`Request failed with status code ${res.statusCode}`)
        );
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        let buffer = Buffer.concat(chunks);

        // Try to decompress if gzipped
        if (res.headers['content-encoding'] === 'gzip') {
          try {
            buffer = zlib.gunzipSync(buffer);
            console.log('Successfully decompressed gzipped content');
          } catch (error) {
            console.log(`Error decompressing content: ${error.message}`);
          }
        }

        resolve(buffer.toString());
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.end();
  });
}

// Start the main process
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
