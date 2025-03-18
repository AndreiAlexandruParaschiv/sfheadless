/**
 * Screaming Frog Sitemap audit
 *
 * This script runs Screaming Frog SEO Spider to crawl a sitemap and generate CSV exports.
 * Usage: node sitemap.js <website-url>
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
console.log(`Starting sitemap crawl for: ${websiteUrl}`);

// Extract domain name for folder naming
const urlObj = new URL(websiteUrl);
const domainName = urlObj.hostname.replace(/^www\./, '').replace(/\./g, '_');

// Get current working directory for absolute paths
const currentDir = process.cwd();
const relativeOutputFolder = path.join(
  config.outputFolder,
  `sitemap_${domainName}`
);
const OUTPUT_FOLDER = path.resolve(currentDir, relativeOutputFolder);

// Create output directory if it doesn't exist
try {
  const parentDir = path.dirname(OUTPUT_FOLDER);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
    console.log(`Created parent output directory: ${parentDir}`);
  }

  if (!fs.existsSync(OUTPUT_FOLDER)) {
    fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_FOLDER}`);
  } else {
    console.log(`Using existing output directory: ${OUTPUT_FOLDER}`);
  }
} catch (error) {
  console.error(`Failed to create directory: ${error.message}`);
  process.exit(1);
}

// Build the sitemap URL - ensure we use www if needed
let sitemapUrl = websiteUrl.replace(/\/$/, '');
if (!sitemapUrl.includes('www.') && websiteUrl.includes('pricefx.com')) {
  sitemapUrl = sitemapUrl.replace('https://', 'https://www.');
}
sitemapUrl += '/sitemap.xml';
console.log(`Using sitemap URL: ${sitemapUrl}`);

// Build the crawl command
const command = `"${config.screamingFrogPath}" --crawl-sitemap "${sitemapUrl}" ${config.saveOptions} --export-format ${config.exportFormat} --export-tabs "${config.exportTabs}" --output-folder "${OUTPUT_FOLDER}"`;

console.log('Running Screaming Frog with the following command:');
console.log(command);

try {
  // Execute the command
  const output = execSync(command, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
  });

  console.log('Crawl completed successfully!');

  // Check if files were created
  const files = fs
    .readdirSync(OUTPUT_FOLDER)
    .filter((file) => !file.startsWith('.'));
  console.log(`\nFiles in output directory: ${files.length}`);

  if (files.length > 0) {
    console.log('Generated files:');
    files.forEach((file) => {
      console.log(`- ${file}`);
    });
    console.log(`\nReports available in: ${OUTPUT_FOLDER}`);
  } else {
    console.log('\nWarning: No files were found in the output directory.');
    console.log('Possible reasons:');
    console.log('1. The sitemap could not be accessed or is empty');
    console.log('2. Export settings may be incorrect');
  }
} catch (error) {
  console.error('Error during crawl:');
  console.error(`Exit code: ${error.status || 'unknown'}`);

  if (error.stdout) {
    console.log(
      `Standard output: ${error.stdout.substring(0, 500)}... (truncated)`
    );
  }

  if (error.stderr) {
    console.error(
      `Standard error: ${error.stderr.substring(0, 500)}... (truncated)`
    );
  }

  console.error('Full error message:', error.message);
}
