#!/usr/bin/env node

import { formatNumber, readJson } from "./lib/common.mjs";
import { searchListings } from "./lib/search.mjs";

const HELP = `Search List of Listings

Usage:
  npm run search -- [options]

Options:
  -q, --query TEXT       Full-text query (all terms must match)
      --id ID            Exact stable listing ID
      --platform NAME    github, web, mcp, or mcp-registry
      --category TEXT    Category substring
      --accepts TYPES    Comma-separated exact types (app, website, library, ai-tool, ...)
      --cost TEXT        Cost substring (free, paid, freemium, ...)
      --status TEXT      Submission or verification-status substring
      --mcp-write LEVEL  native, mcp_workflow, api_cli_only, manual_only, ...
      --min-stars N      Minimum GitHub stars
      --max-stars N      Maximum GitHub stars
      --limit N          Result limit, 1–500 (default: 20)
      --json             Emit complete JSON records
  -h, --help             Show this help
`;

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["-h", "--help"].includes(argument)) options.help = true;
    else if (argument === "--json") options.json = true;
    else {
      const names = {
        "-q": "query",
        "--query": "query",
        "--id": "id",
        "--platform": "platform",
        "--category": "category",
        "--accepts": "accepts",
        "--cost": "cost",
        "--status": "status",
        "--mcp-write": "mcpWrite",
        "--min-stars": "minStars",
        "--max-stars": "maxStars",
        "--limit": "limit"
      };
      const key = names[argument];
      if (!key) throw new Error(`Unknown option: ${argument}`);
      const value = argv[++index];
      if (value === undefined) throw new Error(`Missing value for ${argument}`);
      options[key] = ["minStars", "maxStars", "limit"].includes(key) ? Number(value) : value;
    }
  }
  return options;
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  console.error("Run with --help for usage.");
  process.exit(2);
}

if (options.help) {
  console.log(HELP);
  process.exit(0);
}

const catalog = await readJson("data/listings.json");
const results = searchListings(catalog.listings, options);

if (options.json) {
  console.log(JSON.stringify({ count: results.length, results }, null, 2));
  process.exit(0);
}

if (!results.length) {
  console.log("No listings matched.");
  process.exit(0);
}

for (const [index, listing] of results.entries()) {
  const signal = listing.repository
    ? `${formatNumber(listing.repository.stars)} stars`
    : listing.metrics?.domain_rating
      ? `DR ${listing.metrics.domain_rating}`
      : listing.submission.mcp_write_level ?? listing.verification.status;
  console.log(`${index + 1}. ${listing.name} [${listing.id}]`);
  console.log(`   ${listing.description}`);
  console.log(`   ${listing.category} · accepts: ${listing.accepts.join(", ")} · ${signal}`);
  console.log(`   ${listing.submission.method}: ${listing.submission.url}`);
}

console.log(`\n${results.length} result${results.length === 1 ? "" : "s"}. Use --json for full records.`);
