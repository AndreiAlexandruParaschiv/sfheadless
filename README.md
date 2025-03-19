# Screaming Frog Sitemap Crawler

This script automates the process of crawling multiple sitemaps using Screaming Frog SEO Spider. It discovers sitemaps from a given domain, processes them, and organizes the output in a structured manner.

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

## Requirements

- Screaming Frog SEO Spider installed
- node.js
- npm packages: fast-xml-parser

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

The script creates a directory structure:

```
results/
  └── sitemap/
      └── sitemap_example_com/
          ├── sitemap/                     # Default sitemap.xml
          │   ├── crawl.seospider
          │   ├── crawl_overview.csv
          │   └── ...
          ├── en_sitemap/                  # /en/sitemap.xml
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
