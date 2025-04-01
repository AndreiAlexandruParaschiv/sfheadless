# SEO Assessment Tools

This repository contains tools for performing SEO and accessibility assessments using Screaming Frog SEO Spider in headless mode.

## Setup

1. Clone this repository
2. Make sure you have Node.js installed (version 14+)
3. Install dependencies with `npm install`
4. Make sure Screaming Frog SEO Spider is installed on your machine
5. Update the `config.json` file with your Screaming Frog path and other preferences

```json
{
  "screamingFrogPath": "/path/to/ScreamingFrogSEOSpiderLauncher",
  "outputFolder": "./results/sitemap",
  "exportTabs": "URL:All,Response Codes:All,Page Titles:All,Meta Description:All",
  "saveOptions": "--headless --save-crawl --save-report \"Crawl Overview\"",
  "exportFormat": "csv"
}
```

## Sitemap Crawler (sitemap.js)

The sitemap crawler processes sitemaps to extract URLs and analyze them with Screaming Frog.

### Features:

- Discovers sitemaps via robots.txt or common locations
- Supports sitemap index files
- Processes both regular and gzipped sitemaps
- Searches for related sitemaps based on discovered ones (language variants, blog sitemaps, etc.)
- Provides organized output of analysis results

### Usage

```
node sitemap.js <website-url>
```

Example:

```
node sitemap.js https://www.example.com
```

The script will:

1. Attempt to locate sitemaps for the domain
2. Process each sitemap found
3. Run Screaming Frog analysis on each sitemap
4. Save results to the configured output directory

## Accessibility Audit (a11y.js)

The accessibility audit tool checks for WCAG compliance issues across pages found in a website's sitemap.

### Features:

- Discovers sitemaps via robots.txt or common locations
- Extracts URLs for accessibility testing
- Performs accessibility audits for multiple WCAG standards:
  - WCAG 2.0 A
  - WCAG 2.0 AA
  - WCAG 2.0 AAA
  - WCAG 2.1 AA
- Generates a comprehensive HTML summary report
- Organizes violations by type and standard

### Usage

```
node a11y.js <website-url>
```

Example:

```
node a11y.js https://www.example.com
```

The script will:

1. Find the website's sitemap
2. Extract URLs for analysis (limited to 50 to prevent overload)
3. Run Screaming Frog accessibility audits for each WCAG standard
4. Generate a summary HTML report
5. Save all results to a dedicated folder in ./results/a11y/
