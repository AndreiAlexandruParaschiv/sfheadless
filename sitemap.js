#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { XMLParser } = require('fast-xml-parser');
const zlib = require('zlib');

// Load configuration from config.json
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Get the website URL from command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Please provide a website URL to crawl.');
  console.error('Usage: node sitemap.js <website-url>');
  process.exit(1);
}

const websiteUrl = args[0];
console.log(`Starting sitemap discovery for: ${websiteUrl}`);

// Extract base URL without trailing slash
const baseUrl = websiteUrl.replace(/\/$/, '');
const urlObj = new URL(baseUrl);
const domain = urlObj.hostname;

// Main function to run the process
async function main() {
  try {
    // Step 1: Find all sitemaps from robots.txt
    let sitemapUrls = await findSitemapsFromRobotsTxt();

    if (sitemapUrls.length === 0) {
      // If no sitemaps found in robots.txt, try the default sitemap.xml location
      console.log(
        'No sitemaps found in robots.txt, trying default sitemap.xml location'
      );
      sitemapUrls.push(`${baseUrl}/sitemap.xml`);
    }

    console.log(
      `Found ${sitemapUrls.length} potential sitemap(s): ${sitemapUrls.join(
        ', '
      )}`
    );

    // Step 2: Process each sitemap
    for (const sitemapUrl of sitemapUrls) {
      await processSitemap(sitemapUrl);
    }

    console.log('All sitemaps have been processed successfully!');
  } catch (error) {
    console.error('Error during sitemap processing:', error.message);
    process.exit(1);
  }
}

// Function to find sitemaps from robots.txt
async function findSitemapsFromRobotsTxt() {
  const robotsUrl = `${urlObj.origin}/robots.txt`;
  console.log(`Looking for sitemaps in robots.txt: ${robotsUrl}`);

  let sitemapLines = [];

  try {
    // Try to fetch robots.txt content
    let robotsTxt = await fetchWithRetry(robotsUrl);

    // Check if content appears to be binary/compressed
    if (isTextContent(robotsTxt)) {
      console.log('----- First 200 characters of robots.txt -----');
      console.log(robotsTxt.substring(0, 200));
      console.log('----- End of preview -----');

      // Parse the robots.txt content line by line
      sitemapLines = robotsTxt
        .split('\n')
        .filter((line) => line.trim().toLowerCase().startsWith('sitemap:'))
        .map((line) => {
          const colonIndex = line.indexOf(':');
          return colonIndex !== -1 ? line.substring(colonIndex + 1).trim() : '';
        })
        .filter((url) => url.length > 0);
    } else {
      console.log(
        'Warning: robots.txt appears to contain binary or compressed content'
      );

      // Try regex approach for binary content
      const matches = robotsTxt.match(/Sitemap:\s*(https?:\/\/[^\s\n\r]+)/gi);
      if (matches?.length > 0) {
        sitemapLines = matches.map((match) =>
          match.replace(/^Sitemap:\s*/i, '').trim()
        );
      }
    }

    console.log(`Found ${sitemapLines.length} sitemaps in robots.txt`);
    if (sitemapLines.length > 0) {
      console.log('Sitemaps found:');
      sitemapLines.forEach((url) => console.log(`- ${url}`));
    }

    return sitemapLines;
  } catch (error) {
    console.log(`Could not fetch robots.txt: ${error.message}`);

    // Fallback to common sitemap locations
    return [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_index.xml`];
  }
}

// Helper function to check if content is mostly text
function isTextContent(content) {
  const isPrintable = (char) => char > 31 && char < 127;
  const printableChars = content
    .split('')
    .filter((c) => isPrintable(c.charCodeAt(0))).length;
  return printableChars / content.length > 0.8;
}

// Function to process a sitemap (handles both regular sitemaps and sitemap indexes)
async function processSitemap(sitemapUrl) {
  console.log(`Processing sitemap: ${sitemapUrl}`);

  try {
    // Fetch and decompress the sitemap if needed
    let sitemapContent = await fetchWithRetry(sitemapUrl);

    // Try to parse the XML
    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });
      const parsed = parser.parse(sitemapContent);

      // Check if it's a sitemap index
      if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
        console.log(
          'This is a sitemap index file containing multiple sitemaps'
        );

        const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
          ? parsed.sitemapindex.sitemap
          : [parsed.sitemapindex.sitemap];

        // Create a parent folder for the sitemap index
        const indexFolderPath = await prepareOutputFolder(sitemapUrl, true);
        console.log(`Created parent index folder: ${indexFolderPath}`);

        // Process each child sitemap with nested folders
        for (const sitemap of sitemaps) {
          const childUrl = sitemap.loc;
          console.log(`Found child sitemap: ${childUrl}`);

          // Run Screaming Frog on the child sitemap with indexFolderPath as parent
          await runScreamingFrog(childUrl, indexFolderPath);
        }
      }
      // It's a regular sitemap
      else if (parsed.urlset && parsed.urlset.url) {
        console.log('This is a regular sitemap file');
        await runScreamingFrog(sitemapUrl);
      } else {
        console.log('Could not determine sitemap type from XML structure');
        console.log('First 200 characters of response:');
        console.log(sitemapContent.substring(0, 200));
        await runScreamingFrog(sitemapUrl);
      }
    } catch (parseError) {
      console.error(`Error parsing sitemap XML: ${parseError.message}`);
      console.log('First 200 characters of response:');
      console.log(sitemapContent.substring(0, 200));
      await runScreamingFrog(sitemapUrl);
    }
  } catch (error) {
    console.error(`Error processing sitemap ${sitemapUrl}: ${error.message}`);
    await runScreamingFrog(sitemapUrl);
  }
}

// Helper function to fetch content with retry and decompression
async function fetchWithRetry(url) {
  // Try multiple fetch methods in sequence
  try {
    // First try: standard fetch with built-in handling
    const response = await fetchUrl(url);
    if (isTextContent(response)) {
      return response;
    }

    // Second try: curl with explicit decompression
    try {
      console.log(
        `Content appears compressed, trying curl with decompression for: ${url}`
      );
      const output = execSync(
        `curl -s -L --compressed -H "Accept-Encoding: gzip" -A "Mozilla/5.0" "${url}" | cat`,
        { encoding: 'utf8' }
      );

      if (isTextContent(output)) {
        console.log('Successfully decompressed content with curl');
        return output;
      }
    } catch (curlError) {
      console.log(`Curl fetch failed: ${curlError.message}`);
    }

    // Return original response if all attempts fail to get better content
    return response;
  } catch (error) {
    throw new Error(`All fetch methods failed: ${error.message}`);
  }
}

// Basic fetch function
async function fetchUrl(url) {
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
      timeout: 10000,
    };

    const req = client.request(options, (res) => {
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        // Handle redirects
        return resolve(fetchUrl(new URL(res.headers.location, url).href));
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

// Helper function to prepare the output folder for a sitemap
async function prepareOutputFolder(sitemapUrl, isIndex = false) {
  // Create a safe name for the folder based on the sitemap URL
  const sitemapName = new URL(sitemapUrl).pathname
    .replace(/\//g, '_')
    .replace(/\.xml$/, '')
    .replace(/^_/, '');

  // If sitemapName is empty (it was just /sitemap.xml), use a default name
  const folderSuffix = sitemapName || 'main';

  // Add index suffix if this is a sitemap index
  const folderName = isIndex ? `sitemap_index` : folderSuffix;

  // Extract domain name for folder naming
  const domainName = domain.replace(/^www\./, '').replace(/\./g, '_');

  // Get current working directory for absolute paths
  const relativeOutputFolder = path.join(
    config.outputFolder,
    `sitemap_${domainName}`,
    folderName
  );
  const OUTPUT_FOLDER = path.resolve(process.cwd(), relativeOutputFolder);

  // Create output directory if it doesn't exist
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

// Function to run Screaming Frog for a specific sitemap
async function runScreamingFrog(sitemapUrl, parentFolder = null) {
  // If this is a child sitemap of an index, use the provided parent folder
  // Otherwise create a new folder path
  let OUTPUT_FOLDER;

  if (parentFolder) {
    // Create a nested folder inside the parent folder for this child sitemap
    const childName = new URL(sitemapUrl).pathname
      .replace(/\//g, '_')
      .replace(/\.xml$/, '')
      .replace(/^_/, '');

    OUTPUT_FOLDER = path.join(parentFolder, childName || 'main');

    // Create this nested folder
    if (!fs.existsSync(OUTPUT_FOLDER)) {
      fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
      console.log(`Created child sitemap directory: ${OUTPUT_FOLDER}`);
    }
  } else {
    // Create a regular output folder for this standalone sitemap
    OUTPUT_FOLDER = await prepareOutputFolder(sitemapUrl);
  }

  // Build the crawl command
  let exportOption = '';
  if (config['bulk-export']) {
    // Use bulk-export if available
    exportOption = `--bulk-export "${config['bulk-export']}"`;
  } else if (config.exportTabs) {
    // Fall back to exportTabs if bulk-export is not set
    exportOption = `--export-tabs "${config.exportTabs}"`;
  }

  const command = `"${config.screamingFrogPath}" --crawl-sitemap "${sitemapUrl}" ${config.saveOptions} --export-format ${config.exportFormat} ${exportOption} --output-folder "${OUTPUT_FOLDER}"`;

  console.log('Running Screaming Frog with the following command:');
  console.log(command);

  try {
    // Execute the command
    execSync(command, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    console.log(`Crawl of ${sitemapUrl} completed successfully!`);

    // Check if files were created
    const files = fs
      .readdirSync(OUTPUT_FOLDER)
      .filter((file) => !file.startsWith('.'));
    console.log(`\nFiles in output directory: ${files.length}`);

    if (files.length > 0) {
      console.log('Generated files:');
      files.forEach((file) => console.log(`- ${file}`));
      console.log(`\nReports available in: ${OUTPUT_FOLDER}`);
    } else {
      console.log('\nWarning: No files were found in the output directory.');
      console.log('Possible reasons:');
      console.log('1. The sitemap could not be accessed or is empty');
      console.log('2. Export settings may be incorrect');
    }
  } catch (error) {
    console.error(
      `Error during crawl of ${sitemapUrl}: Exit code: ${
        error.status || 'unknown'
      }`
    );
    console.error('Error message:', error.message.substring(0, 500));
  }
}

// Start the main process
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
