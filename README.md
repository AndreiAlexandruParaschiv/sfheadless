# Sitemap Discovery and Crawler

An efficient Node.js script to discover, process, and crawl website sitemaps using Screaming Frog SEO Spider.

## Usage

```bash
node sitemap.js https://example.com
```

The script will:

1. Check robots.txt for sitemap declarations
2. Process sitemap index files to find all child sitemaps
3. Crawl each sitemap separately with Screaming Frog
4. Export URL data, response codes, page titles, and meta descriptions
5. Save results to a structured folder for each sitemap

## Features

- **Comprehensive sitemap discovery**:
  - Reads robots.txt to find all declared sitemaps
  - Falls back to default sitemap.xml if needed
  - Handles gzipped robots.txt files automatically
- **Enhanced content handling**:
  - Automatically decompresses gzipped content
  - Multiple fallback methods to ensure content retrieval
  - Robust binary content detection
- **Sitemap index support**:
  - Detects and parses sitemap index files
  - Creates organized nested folder structure
  - Processes each child sitemap separately
- **Organized output**:
  - Creates structured folders for each sitemap
  - Names folders based on sitemap path
  - Separate folders for sitemap index children
- **Smart URL handling**:
  - Handles www vs non-www domains
  - Follows redirects automatically
  - Retries failed connections

## Requirements

- Screaming Frog SEO Spider installed
- Node.js
- NPM packages: fast-xml-parser

## Installation

```bash
npm install
```

## Configuration

Settings are stored in `config.json`:

```json
{
  "screamingFrogPath": "/Applications/Screaming Frog SEO Spider.app/Contents/MacOS/ScreamingFrogSEOSpiderLauncher",
  "outputFolder": "./results/sitemap",
  "exportTabs": "URL:All,Response Codes:All,Page Titles:All,Meta Description:All",
  "saveOptions": "--headless --save-crawl --save-report \"Crawl Overview\"",
  "exportFormat": "csv",
  "bulk-export": "URL:All,Response Codes:All,Page Titles:All,Meta Description:All,Links:All Inlinks,Links:All Outlinks,Sitemaps:URLs in Sitemap"
}
```

Customize these settings to match your environment:

- `screamingFrogPath`: Path to your Screaming Frog executable
- `outputFolder`: Base directory for results (relative or absolute)
- `exportTabs`: Data to export from crawls
- `saveOptions`: Additional Screaming Frog options
- `exportFormat`: Output format (csv or xlsx)

## Output Structure

The script creates a well-organized directory structure:

```
results/
  └── sitemap/
      └── sitemap_example_com/
          ├── sitemap/                     # Default sitemap.xml
          │   ├── crawl.seospider
          │   ├── crawl_overview.csv
          │   └── ...
          ├── ca_sitemap/                  # /ca/sitemap.xml
          │   ├── crawl.seospider
          │   ├── crawl_overview.csv
          │   └── ...
          ├── blog_blog-sitemap/           # /blog/blog-sitemap.xml
          │   ├── crawl.seospider
          │   ├── crawl_overview.csv
          │   └── ...
          └── sitemap_index/               # For sitemap index files
              ├── product_sitemap/         # Child sitemap in index
              │   ├── crawl.seospider
              │   ├── crawl_overview.csv
              │   └── ...
              └── category_sitemap/        # Another child sitemap
                  ├── crawl.seospider
                  ├── crawl_overview.csv
                  └── ...
```

## Output Files

Each sitemap crawl generates several files:

- `crawl.seospider` - Screaming Frog project file
- `crawl_overview.csv` - Summary report of the crawl
- `url_all.csv` - Complete URL data
- `response_codes_all.csv` - HTTP response code data
- `page_titles_all.csv` - Page title data
- `meta_description_all.csv` - Meta description data

## Error Handling

The script includes comprehensive error handling:

- Retries failed HTTP requests
- Falls back to curl for problematic downloads
- Handles binary and compressed content
- Gracefully manages XML parsing errors
- Provides detailed logs of any issues

## Performance Optimization

The script is optimized for efficient operation:

- Minimizes redundant HTTP requests
- Uses streaming for large file handling
- Implements appropriate timeouts
- Provides fallback mechanisms for resilience
