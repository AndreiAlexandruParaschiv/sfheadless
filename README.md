# ScreamingFrog Headless approach

A script to crawl a sitemap using Screaming Frog SEO Spider.

## Usage

```bash
node sitemap.js https://example.com
```

The script will:

1. Crawl the sitemap at https://example.com/sitemap.xml
2. Export URL data, response codes, page titles, and meta descriptions
3. Save results to a structured folder: `/results/sitemap/sitemap_example_com/`

## Features

- Automatically handles www vs non-www domains
- Creates structured output folders based on the domain name
- Detects and reports common issues with sitemap crawling
- Uses absolute paths to ensure compatibility with ScreamingFrog

## Requirements

- ScreamingFrog app installed
- Node.js

## Configuration

Settings are stored in `config.json`:

```json
{
  "screamingFrogPath": "/path/to/ScreamingFrogSEOSpiderLauncher",
  "outputFolder": "./results/sitemap",
  "exportTabs": "URL:All,Response Codes:All,Page Titles:All,Meta Description:All",
  "saveOptions": "--headless --save-crawl --save-report \"Crawl Overview\"",
  "exportFormat": "csv"
}
```

The `outputFolder` setting uses a relative path structure:

- A "results" parent folder is created in the current directory
- Within that, a "sitemap" folder organizes all sitemap crawls
- Each crawl creates a domain-specific subfolder (e.g., "sitemap_example_com")

## Limitations

- Currently only handles a single sitemap.xml file
- Does not support sitemap index files or multiple sitemaps
- Does not detect sitemaps from robots.txt

## Future Improvements

- Support for sitemap index files
- Multiple sitemap handling
- Robots.txt sitemap detection
- Custom sitemap URL input
