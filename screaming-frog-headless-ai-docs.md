# Screaming Frog SEO Spider in Headless Mode with AI for Accessibility

This documentation provides a comprehensive guide on using Screaming Frog SEO Spider in headless mode for accessibility testing and how to integrate AI to generate suggestions and fixes for accessibility issues.

## Introduction to Accessibility Testing with Screaming Frog

Screaming Frog SEO Spider is a powerful website crawler that can be used for various SEO and technical website audits. While primarily known for SEO analysis, it also includes robust accessibility testing capabilities that can identify WCAG (Web Content Accessibility Guidelines) compliance issues.

### Benefits of Headless Mode for Accessibility Testing

Running Screaming Frog in headless mode offers several advantages for accessibility testing:

1. **Automation**: Perform accessibility audits without manual intervention
2. **Scalability**: Test large websites or multiple websites efficiently
3. **Integration**: Incorporate accessibility testing into CI/CD pipelines
4. **Resource Efficiency**: Run tests without a graphical interface, reducing resource usage
5. **Scheduled Audits**: Set up regular accessibility checks to monitor compliance over time

## Headless Mode Configuration for Accessibility Testing

### Installation and Setup

1. **Install Screaming Frog SEO Spider**:

   - Download from the [official website](https://www.screamingfrog.co.uk/seo-spider/)
   - A license is required for crawling more than 500 URLs

2. **Configure Environment**:
   - Ensure sufficient memory allocation for large crawls
   - Set up a configuration file with your Screaming Frog path:

```json
{
  "screamingFrogPath": "/path/to/ScreamingFrogSEOSpiderLauncher",
  "outputFolder": "./results/accessibility",
  "exportTabs": "URL:All,Response Codes:All,Page Titles:All,Meta Description:All",
  "saveOptions": "--headless --save-crawl --save-report \"Crawl Overview\"",
  "exportFormat": "csv"
}
```

### Command-Line Parameters for Accessibility Testing

Screaming Frog offers several command-line parameters specific to accessibility testing:

```bash
# Basic headless accessibility audit
"path/to/ScreamingFrogSEOSpiderLauncher" --headless --crawl https://example.com --bulk-export "Accessibility:WCAG 2.1 AA:All Violations" --output-folder "/path/to/output" --export-format csv

# Audit from a list of URLs
"path/to/ScreamingFrogSEOSpiderLauncher" --headless --crawl-list "/path/to/url-list.csv" --bulk-export "Accessibility:WCAG 2.0 A:All Violations" --output-folder "/path/to/output" --export-format csv

# Audit with multiple WCAG standards
"path/to/ScreamingFrogSEOSpiderLauncher" --headless --crawl https://example.com --bulk-export "Accessibility:WCAG 2.0 A:All Violations,Accessibility:WCAG 2.0 AA:All Violations,Accessibility:WCAG 2.1 AA:All Violations" --output-folder "/path/to/output" --export-format csv
```

### Key Command-Line Options

| Option                     | Description                                 |
| -------------------------- | ------------------------------------------- |
| `--headless`               | Run Screaming Frog without a GUI            |
| `--crawl [url]`            | Specify the URL to crawl                    |
| `--crawl-list [file]`      | Crawl URLs from a list file                 |
| `--bulk-export [items]`    | Export specific data (comma-separated)      |
| `--output-folder [path]`   | Specify the output directory                |
| `--export-format [format]` | Specify the export format (csv, xlsx, etc.) |
| `--config [file]`          | Use a specific configuration file           |
| `--save-crawl`             | Save the crawl for later analysis           |
| `--overwrite`              | Overwrite existing files                    |
| `--max-urls [number]`      | Limit the number of URLs to crawl           |

### WCAG Standards Available in Screaming Frog

Screaming Frog can test against multiple WCAG standards:

- WCAG 2.0 A
- WCAG 2.0 AA
- WCAG 2.0 AAA
- WCAG 2.1 A
- WCAG 2.1 AA
