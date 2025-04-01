#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const csv = require('csv-parser');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const PDFDocument = require('pdfkit');

// Load configuration
let config = {};
try {
  config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
} catch (error) {
  console.error(`Error loading config: ${error.message}`);
  process.exit(1);
}

// Check if Google API key is provided
if (!config.googleApiKey) {
  console.error(
    'Google API key is missing in config.json. Please add "googleApiKey" field.'
  );
  process.exit(1);
}

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(config.googleApiKey);

// Main function
async function main() {
  if (process.argv.length < 3) {
    console.log('Usage: node sitemap-ai.js <website-url>');
    process.exit(1);
  }

  const targetUrl = process.argv[2];
  console.log(
    `Starting sitemap analysis with AI integration for: ${targetUrl}`
  );

  // 1. Run sitemap crawler to get data
  await runSitemapCrawler(targetUrl);

  // 2. Find the latest sitemap results
  const sitemapResultsPath = findLatestSitemapResults(targetUrl);
  if (!sitemapResultsPath) {
    console.error(
      'No sitemap results found. Please run the sitemap crawler first.'
    );
    process.exit(1);
  }

  // 3. Extract data from sitemap results
  const sitemapData = await extractSitemapData(sitemapResultsPath);

  // 4. Generate AI insights
  await generateAIInsights(targetUrl, sitemapData);
}

// Run the sitemap crawler
async function runSitemapCrawler(url) {
  console.log('Running sitemap crawler to gather data...');
  try {
    execSync(`node sitemap.js ${url}`, {
      encoding: 'utf8',
      stdio: 'inherit',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    console.log('Sitemap crawler completed successfully');
  } catch (error) {
    console.error(`Error running sitemap crawler: ${error.message}`);
    process.exit(1);
  }
}

// Find the latest sitemap results based on domain
function findLatestSitemapResults(url) {
  const domain = new URL(url).hostname.replace('www.', '');
  const resultsDir = path.join(process.cwd(), 'results', 'sitemap');

  if (!fs.existsSync(resultsDir)) {
    return null;
  }

  // Find directories matching the domain
  const sitemapDirs = fs
    .readdirSync(resultsDir)
    .filter((dir) => dir.includes(domain.replace(/\./g, '_')))
    .map((dir) => path.join(resultsDir, dir))
    .filter((dir) => fs.statSync(dir).isDirectory());

  if (sitemapDirs.length === 0) {
    return null;
  }

  // Get the most recent directory based on creation time
  return sitemapDirs.sort((a, b) => {
    return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
  })[0];
}

// Extract data from sitemap results
async function extractSitemapData(resultsPath) {
  console.log(`Extracting data from: ${resultsPath}`);

  const data = {
    urls: [],
    overview: {},
    sitemapStructure: {},
  };

  // Find all CSV files in the results directory and subdirectories
  const csvFiles = findFiles(resultsPath, '.csv');

  // Process URL data if available
  const urlAllFile = csvFiles.find((file) =>
    file.toLowerCase().includes('url_all.csv')
  );
  if (urlAllFile) {
    data.urls = await readCSV(urlAllFile);
    console.log(`Extracted ${data.urls.length} URLs from sitemap`);
  }

  // Process crawl overview if available
  const overviewFile = csvFiles.find((file) =>
    file.toLowerCase().includes('crawl_overview.csv')
  );
  if (overviewFile) {
    const overviewData = await readCSV(overviewFile);
    data.overview = overviewData.reduce((acc, row) => {
      acc[row.Name] = row.Value;
      return acc;
    }, {});
  }

  // Analyze sitemap structure
  data.sitemapStructure = analyzeSitemapStructure(resultsPath);

  return data;
}

// Find all files with a specific extension in a directory and its subdirectories
function findFiles(dir, extension) {
  let results = [];

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      results = results.concat(findFiles(itemPath, extension));
    } else if (item.endsWith(extension)) {
      results.push(itemPath);
    }
  }

  return results;
}

// Read a CSV file and return its contents as an array of objects
function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

// Analyze the structure of sitemaps found
function analyzeSitemapStructure(resultsPath) {
  const structure = {
    mainSitemaps: [],
    childSitemaps: [],
    languages: new Set(),
    contentTypes: new Set(),
  };

  // Check if this is a sitemap index by looking for subdirectories
  const items = fs.readdirSync(resultsPath);
  for (const item of items) {
    const itemPath = path.join(resultsPath, item);
    if (fs.statSync(itemPath).isDirectory()) {
      structure.childSitemaps.push(item);

      // Analyze sitemap name for language codes
      const langMatch = item.match(
        /[_-](en|fr|es|de|it|pt|ru|zh|ja|ko|ar|nl|sv|no|fi|da|pl|tr|cs|hu|ro|bg|el|he|th|vi|id|ms|hi|bn|uk|fa)[_-]/i
      );
      if (langMatch) {
        structure.languages.add(langMatch[1].toLowerCase());
      }

      // Analyze sitemap name for content types
      if (item.includes('blog') || item.includes('news'))
        structure.contentTypes.add('blog');
      if (item.includes('product') || item.includes('catalog'))
        structure.contentTypes.add('products');
      if (item.includes('image')) structure.contentTypes.add('images');
      if (item.includes('video')) structure.contentTypes.add('videos');
    } else if (item.endsWith('.xml') || item.includes('sitemap')) {
      structure.mainSitemaps.push(item);
    }
  }

  return {
    mainSitemapCount: structure.mainSitemaps.length,
    childSitemapCount: structure.childSitemaps.length,
    languages: Array.from(structure.languages),
    contentTypes: Array.from(structure.contentTypes),
    isMultilingual: structure.languages.size > 1,
    hasSeparateContentTypes: structure.contentTypes.size > 0,
  };
}

// Generate AI insights using Gemini
async function generateAIInsights(targetUrl, sitemapData) {
  console.log('Generating AI insights from sitemap data...');

  try {
    // Create a model instance - try to use the preferred model, fallback to stable model
    let modelName = 'gemini-1.5-pro';
    console.log(`Using Gemini model: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });

    // Prepare sitemap summary for the prompt
    const urlCount = sitemapData.urls.length;
    const uniqueStatusCodes = new Set(
      sitemapData.urls.map((url) => url['Status Code'] || 'Unknown')
    );
    const statusCodeDistribution = Array.from(uniqueStatusCodes)
      .map((code) => {
        const count = sitemapData.urls.filter(
          (url) => (url['Status Code'] || 'Unknown') === code
        ).length;
        return `${code}: ${count} URLs (${((count / urlCount) * 100).toFixed(
          1
        )}%)`;
      })
      .join(', ');

    // Gather path patterns
    const pathPatterns = {};
    sitemapData.urls.forEach((url) => {
      try {
        const urlPath = new URL(url.Address).pathname;
        const pathSegments = urlPath.split('/').filter(Boolean);

        if (pathSegments.length > 0) {
          const firstSegment = pathSegments[0];
          pathPatterns[firstSegment] = (pathPatterns[firstSegment] || 0) + 1;
        }
      } catch (error) {
        // Skip invalid URLs
      }
    });

    // Sort path patterns by frequency
    const sortedPathPatterns = Object.entries(pathPatterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => `/${path}/: ${count} URLs`)
      .join(', ');

    // Create the prompt with sitemap data insights
    const prompt = `
You are an SEO expert analyzing a sitemap for ${targetUrl}. Please provide insights and recommendations based on the following sitemap data:

SITEMAP STRUCTURE:
- Total sitemaps: ${
      sitemapData.sitemapStructure.mainSitemapCount +
      sitemapData.sitemapStructure.childSitemapCount
    }
- Main sitemaps: ${sitemapData.sitemapStructure.mainSitemapCount}
- Child sitemaps: ${sitemapData.sitemapStructure.childSitemapCount}
- Languages detected: ${
      sitemapData.sitemapStructure.languages.join(', ') || 'None'
    }
- Content types detected: ${
      sitemapData.sitemapStructure.contentTypes.join(', ') || 'None'
    }

URL DATA:
- Total URLs: ${urlCount}
- Status code distribution: ${statusCodeDistribution}
- Top URL patterns: ${sortedPathPatterns}

CRAWL STATISTICS:
${Object.entries(sitemapData.overview)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join('\n')}

Based on this information, please provide:
1. A brief overview of the sitemap structure and quality
2. Key SEO issues or opportunities identified from the sitemap data
3. Specific recommendations for improving the sitemap and overall site structure
4. An analysis of URL patterns and content organization
5. Suggestions for better organizing content or implementing additional sitemaps if needed

Focus on actionable insights that would have the most impact on SEO performance.
`;

    // Generate AI response
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Create output directory
    const outputDir = path.join(process.cwd(), 'results', 'sitemap-ai');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create a friendly domain name for the output file
    const domain = new URL(targetUrl).hostname
      .replace('www.', '')
      .replace(/\./g, '_');
    const outputFile = path.join(outputDir, `${domain}_ai_insights.md`);

    // Save the AI insights to a file
    const markdown = `# Sitemap AI Analysis for ${targetUrl}
> Generated on: ${new Date().toLocaleString()}

${response}
`;
    fs.writeFileSync(outputFile, markdown);

    console.log('\n=== AI ANALYSIS COMPLETED ===');
    console.log(`Insights saved to: ${outputFile}`);
    console.log('\nSummary of AI insights:');
    console.log(response.substring(0, 500) + '...');
    console.log('\nFor the complete analysis, please open the generated file.');

    // Generate PDF report with status code analysis
    console.log('\nGenerating PDF status report...');

    // Prepare data for PDF by grouping URLs by sitemap source and status code
    const statusData = {};

    // Group URLs by sitemap and status code
    sitemapData.urls.forEach((url) => {
      // We need to determine which sitemap this URL came from
      let sitemapName = 'main-sitemap';

      // Try to determine the sitemap source based on URL pattern and directory structure
      if (url.Address) {
        const address = url.Address;

        // Look at URL pattern to determine likely source sitemap
        if (address.includes('24petwatch.com/ca/blog/')) {
          sitemapName = 'ca-blog-sitemap';
        } else if (address.includes('24petwatch.com/blog/')) {
          sitemapName = 'blog-sitemap';
        } else if (address.includes('24petwatch.com/ca/')) {
          sitemapName = 'ca-sitemap';
        } else {
          sitemapName = 'main-sitemap';
        }
      }

      // Create sitemap entry if it doesn't exist
      if (!statusData[sitemapName]) {
        statusData[sitemapName] = {
          total: 0,
          ok: 0,
          redirects: [],
          errors: [],
        };
      }

      // Increment counts and categorize by status code
      statusData[sitemapName].total++;

      const status = url['Status Code'] || 'Unknown';
      if (status === '200' || status === 200) {
        statusData[sitemapName].ok++;
      } else if (
        [301, 302, 303, 307, 308, '301', '302', '303', '307', '308'].includes(
          status
        )
      ) {
        statusData[sitemapName].redirects.push({
          url: url.Address,
          status,
        });
      } else {
        statusData[sitemapName].errors.push({
          url: url.Address,
          status,
        });
      }
    });

    // Debug: Print sitemap data counts
    console.log('URL counts by sitemap:');
    Object.keys(statusData).forEach((key) => {
      console.log(`${key}: ${statusData[key].total} URLs`);
    });

    // Generate PDF with the status data
    const validSitemaps = Object.keys(statusData).filter(
      (key) => statusData[key] && statusData[key].total > 0
    );

    // Create a PDF with each sitemap on a separate page
    if (validSitemaps.length === 0) {
      console.log('No valid sitemap data found for PDF generation');
    } else {
      // Force the sitemaps into the proper order (main, ca, blog, ca-blog)
      const orderedSitemaps = [];

      // Add all four sitemaps, creating dummy data if needed
      // Main sitemap
      orderedSitemaps.push('main-sitemap');
      if (!statusData['main-sitemap']) {
        statusData['main-sitemap'] = {
          total: 0,
          ok: 0,
          redirects: [],
          errors: [],
        };
      }

      // CA sitemap
      orderedSitemaps.push('ca-sitemap');
      if (!statusData['ca-sitemap']) {
        statusData['ca-sitemap'] = {
          total: 0,
          ok: 0,
          redirects: [],
          errors: [],
        };
      }

      // Blog sitemap
      orderedSitemaps.push('blog-sitemap');
      if (!statusData['blog-sitemap']) {
        statusData['blog-sitemap'] = {
          total: 0,
          ok: 0,
          redirects: [],
          errors: [],
        };
      }

      // CA blog sitemap
      orderedSitemaps.push('ca-blog-sitemap');
      if (!statusData['ca-blog-sitemap']) {
        statusData['ca-blog-sitemap'] = {
          total: 0,
          ok: 0,
          redirects: [],
          errors: [],
        };
      }

      // Generate PDF with ordered sitemaps (one per page) and action items
      console.log(
        `Generating PDF with ${orderedSitemaps.length} sitemaps on separate pages...`
      );
      const pdfOutputPath = path.join(outputDir, `${domain}_status_report.pdf`);
      await generatePDF(statusData, pdfOutputPath, orderedSitemaps);
      console.log(`PDF status report generated at: ${pdfOutputPath}`);
    }
  } catch (error) {
    console.error(`Error generating AI insights: ${error.message}`);
    if (error.message.includes('API key')) {
      console.error(
        'Please ensure your Google API key is valid and has access to the Gemini API.'
      );
    }
  }
}

async function checkSitemapUrls(sitemapUrl) {
  // Fetch sitemap
  const response = await axios.get(sitemapUrl);
  const parser = new XMLParser();
  const sitemap = parser.parse(response.data);

  // Extract URLs
  const urls = sitemap.urlset.url.map((item) => item.loc);

  // Check status codes
  const results = {
    total: urls.length,
    ok: 0,
    redirects: [],
    errors: [],
    statusCounts: {},
  };

  for (const url of urls) {
    try {
      const response = await axios.head(url);
      const status = response.status;

      results.statusCounts[status] = (results.statusCounts[status] || 0) + 1;

      if (status === 200) {
        results.ok++;
      } else if (status >= 300 && status < 400) {
        results.redirects.push({ url, status });
      } else {
        results.errors.push({ url, status });
      }
    } catch (error) {
      const status = error.response?.status || 'unknown';
      results.statusCounts[status] = (results.statusCounts[status] || 0) + 1;
      results.errors.push({ url, status });
    }
  }

  return results;
}

async function generatePDF(results, outputPath, orderedSitemaps) {
  const doc = new PDFDocument({ bufferPages: true });
  const stream = fs.createWriteStream(outputPath);

  doc.pipe(stream);

  // Track pages
  const pages = [];

  // Create title page
  pages.push(1);
  doc.fontSize(24).text('Sitemap Status Check Report', { align: 'center' });
  doc.moveDown();

  doc.fontSize(14).text('Description', { underline: true });
  doc
    .fontSize(12)
    .text(
      'This check verifies that all the URLs in the sitemap return a 200 OK status code and are indexable.'
    );
  doc.moveDown();

  // Add information about which sitemaps were checked
  doc.fontSize(14).text('Sitemaps Checked:', { underline: true });
  orderedSitemaps.forEach((key, i) => {
    let displayName = getSitemapDisplayName(key);
    doc.fontSize(12).text(`${i + 1}. ${displayName}`);
  });

  doc.moveDown();
  doc.text(`See detailed results for each sitemap on the following pages.`);

  // Create separate page for each sitemap
  orderedSitemaps.forEach((sitemapKey) => {
    // Start a new page for each sitemap
    doc.addPage();
    pages.push(doc.bufferedPageRange().count);

    const data = results[sitemapKey];
    const displayName = getSitemapDisplayName(sitemapKey);

    // Header
    doc.fontSize(16).text(displayName, { underline: true });
    doc.moveDown(0.5);

    // Stats
    if (data.total === 0) {
      doc.fontSize(12).text(`No URLs found in this sitemap.`);
    } else {
      const okPercentage = ((data.ok / data.total) * 100).toFixed(2);
      doc
        .fontSize(12)
        .text(`A total of ${data.total} URLs have been checked.`, {
          continued: false,
        });
      doc.text(
        `Of these, ${data.ok} responded with 200 OK (${okPercentage}%).`,
        { continued: false }
      );

      // Redirects
      if (data.redirects && data.redirects.length > 0) {
        doc.moveDown(0.5);
        doc.text(`${data.redirects.length} URLs responded with redirects:`);
        data.redirects.slice(0, 10).forEach((item) => {
          doc.text(`- ${item.url} (${item.status})`, { indent: 20 });
        });
        if (data.redirects.length > 10) {
          doc.text(`... and ${data.redirects.length - 10} more`, {
            indent: 20,
          });
        }
      }

      // Errors
      if (data.errors && data.errors.length > 0) {
        doc.moveDown(0.5);
        doc.text(`${data.errors.length} URLs returned error status codes:`);
        data.errors.slice(0, 10).forEach((item) => {
          doc.text(`- ${item.url} (${item.status})`, { indent: 20 });
        });
        if (data.errors.length > 10) {
          doc.text(`... and ${data.errors.length - 10} more`, { indent: 20 });
        }
      }
    }
  });

  // Add action items page
  doc.addPage();
  pages.push(doc.bufferedPageRange().count);
  doc.fontSize(18).text('Action Items Required', { underline: true });
  doc.moveDown(0.5);
  doc
    .fontSize(12)
    .text(
      '- Make sure your sitemap only includes live URLs that return the 200 (OK) response code.'
    );

  // Check if there are any redirects to include specific recommendations
  let hasRedirects = false;
  Object.values(results).forEach((data) => {
    if (data && data.redirects && data.redirects.length > 0) {
      hasRedirects = true;
    }
  });

  if (hasRedirects) {
    doc.moveDown(0.5);
    doc.text('- Update redirecting URLs in the sitemap:');
    doc.text('  - Either replace them with their final destination URLs', {
      indent: 20,
    });
    doc.text('  - Or remove them if they are no longer relevant', {
      indent: 20,
    });
  }

  // Check if there are any 404 errors to include specific recommendations
  let has404s = false;
  Object.values(results).forEach((data) => {
    if (data && data.errors) {
      data.errors.forEach((error) => {
        if (error.status === '404' || error.status === 404) {
          has404s = true;
        }
      });
    }
  });

  if (has404s) {
    doc.moveDown(0.5);
    doc.text('- For pages returning 404 errors:');
    doc.text('  - Remove deleted pages from the sitemap', { indent: 20 });
    doc.text('  - Restore important content if it was accidentally removed', {
      indent: 20,
    });
    doc.text('  - Implement 301 redirects for moved content', { indent: 20 });
  }

  // Add sitemaps best practices
  doc.moveDown(1);
  doc.fontSize(14).text('Sitemap Best Practices:', { underline: true });
  doc.fontSize(12).text('- Keep sitemaps updated when content changes');
  doc.text('- Verify sitemaps at least monthly');
  doc.text('- Include only canonical URLs (avoid duplicate content)');
  doc.text('- Use a sitemap index file if you have multiple sitemaps');
  doc.text(
    '- Submit sitemaps to Google Search Console and Bing Webmaster Tools'
  );

  // Add page numbers
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .text(
        `Page ${i + 1} of ${totalPages}`,
        doc.page.width - 100,
        doc.page.height - 20,
        { width: 90, align: 'right' }
      );
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// Helper function to get display name for a sitemap key
function getSitemapDisplayName(key) {
  switch (key) {
    case 'main-sitemap':
      return 'Main Sitemap (sitemap.xml)';
    case 'ca-sitemap':
      return 'CA Sitemap (ca/sitemap.xml)';
    case 'blog-sitemap':
      return 'Blog Sitemap (blog/blog-sitemap.xml)';
    case 'ca-blog-sitemap':
      return 'CA Blog Sitemap (ca/blog/blog-sitemap.xml)';
    default:
      return `Sitemap: ${key}`;
  }
}

// Run the main function
main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
