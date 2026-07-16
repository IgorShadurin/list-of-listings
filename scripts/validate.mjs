#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { canonicalUrl, readJson, ROOT, slugify } from "./lib/common.mjs";
import { resolve } from "node:path";

const [catalog, githubSource, webSource, manualSource, verifiedWebSource, exclusionsSource, schema, candidates, readme, readmeStat] = await Promise.all([
  readJson("data/listings.json"),
  readJson("data/sources/github-awesome.json"),
  readJson("data/sources/web-directories.json"),
  readJson("data/manual-listings.json"),
  readJson("data/verified-web-listings.json"),
  readJson("data/exclusions.json"),
  readJson("schemas/catalog.schema.json"),
  readJson("data/candidates.json"),
  readFile(resolve(ROOT, "README.md"), "utf8"),
  stat(resolve(ROOT, "README.md"))
]);

const errors = [];
const warnings = [];
const ids = new Set();
const urls = new Set();
const acceptedTypes = new Set([
  "ai-tool", "api", "app", "curated-list", "dataset-or-model", "library",
  "mcp-server", "open-source-project", "plugin", "project", "website"
]);

function error(message) { errors.push(message); }
function warning(message) { warnings.push(message); }
function validHttpUrl(value) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

const categories = [...new Set(catalog.listings.map((listing) => listing.category))];
const expectedCategoryFiles = new Set(categories.map((category) => `${slugify(category)}.md`));
let categoryFiles = [];
try {
  categoryFiles = (await readdir(resolve(ROOT, "categories"))).filter((file) => file.endsWith(".md"));
} catch {
  error("Generated categories directory is missing or unreadable");
}
const categoryFileSet = new Set(categoryFiles);
for (const file of expectedCategoryFiles) {
  if (!categoryFileSet.has(file)) error(`Missing generated category page: categories/${file}`);
}
for (const file of categoryFileSet) {
  if (!expectedCategoryFiles.has(file)) error(`Unexpected generated category page: categories/${file}`);
}

if (catalog.schema_version !== "1.0.0") error(`Unexpected schema version: ${catalog.schema_version}`);
if (catalog.listings.length < 1000) error(`Catalog has ${catalog.listings.length} entries; expected at least 1,000.`);
if (catalog.stats.total !== catalog.listings.length) error("stats.total does not match listings.length");
if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") error("Unexpected JSON Schema dialect");
if (githubSource.entries.length < 1000) error("GitHub source contains fewer than 1,000 entries");
if (webSource.entries.length < 25) error("Web source is unexpectedly small");
if (manualSource.listings.filter((entry) => entry.category === "MCP & Agent Publishing").length < 10) {
  error("MCP-curated manual source is unexpectedly small");
}
if (verifiedWebSource.listings.length < 40) error("Primary-source verified web catalog is unexpectedly small");
if (catalog.stats.verified_primary < 50) error("Too few primary-source verified listings");
if (catalog.stats.excluded_definite_dead !== exclusionsSource.exclusions.length) {
  error("excluded_definite_dead does not match data/exclusions.json");
}

for (const [index, listing] of catalog.listings.entries()) {
  const label = listing.id || `index ${index}`;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(listing.id)) error(`${label}: invalid stable ID`);
  if (ids.has(listing.id)) error(`${label}: duplicate ID`);
  ids.add(listing.id);

  if (!listing.name?.trim()) error(`${label}: missing name`);
  if (!listing.description?.trim()) error(`${label}: missing description`);
  if (!validHttpUrl(listing.url)) error(`${label}: invalid URL ${listing.url}`);
  if (!validHttpUrl(listing.submission?.url)) error(`${label}: invalid submission URL ${listing.submission?.url}`);
  if (listing.submission?.guidelines_url && !validHttpUrl(listing.submission.guidelines_url)) {
    error(`${label}: invalid guidelines URL ${listing.submission.guidelines_url}`);
  }
  const canonical = canonicalUrl(listing.url).toLowerCase();
  if (urls.has(canonical)) error(`${label}: duplicate canonical URL ${canonical}`);
  urls.add(canonical);

  if (!Array.isArray(listing.accepts) || !listing.accepts.length) error(`${label}: accepts must be nonempty`);
  for (const type of listing.accepts ?? []) {
    if (!acceptedTypes.has(type)) error(`${label}: unknown accepted type ${type}`);
  }
  for (const field of ["minimum_stars", "minimum_project_age_days"]) {
    const value = listing.requirements?.[field];
    if (value !== null && (!Number.isInteger(value) || value < 0)) error(`${label}: invalid ${field}`);
  }
  if (!Array.isArray(listing.requirements?.rules_summary)) error(`${label}: rules_summary must be an array`);
  if (!Array.isArray(listing.automation?.agent_automatable_via)) error(`${label}: missing automation channels`);
  if (!Array.isArray(listing.evidence)) error(`${label}: evidence must be an array`);
  if (!Array.isArray(listing.tags)) error(`${label}: tags must be an array`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(listing.verification?.checked_at ?? "")) error(`${label}: invalid verification date`);

  if (["native_write", "native_write_general_api"].includes(listing.submission?.mcp_write_level)) {
    if (!listing.automation.machine_submittable) error(`${label}: MCP-native write marked non-machine-submittable`);
    if (!listing.evidence.length) error(`${label}: MCP-native write lacks evidence`);
  }
}

const platformCounts = {};
for (const listing of catalog.listings) platformCounts[listing.platform] = (platformCounts[listing.platform] ?? 0) + 1;
if (JSON.stringify(platformCounts) !== JSON.stringify(catalog.stats.by_platform)) {
  error("stats.by_platform does not match generated listing counts");
}

if (!readme.startsWith("<!-- This file is generated")) error("README is missing its generated-file marker");
if (!readme.includes(`**${catalog.stats.total.toLocaleString("en-US")}** entries`)) error("README does not contain the catalog total");
if (readmeStat.size > 524_288) error(`README is ${readmeStat.size} bytes; keep it at or below 512 KiB for GitHub rendering`);
if (webSource.source.license !== "MIT" || !webSource.source.commit) error("Web source provenance is incomplete");
if (readme.includes("<details")) error("README must link to category pages instead of embedding category details");

for (const category of categories) {
  const entries = catalog.listings.filter((listing) => listing.category === category);
  const file = `${slugify(category)}.md`;
  const rootLink = `categories/${file}`;
  if (!readme.includes(`](${rootLink})`)) error(`README is missing category link: ${rootLink}`);
  let page = "";
  try {
    page = await readFile(resolve(ROOT, "categories", file), "utf8");
  } catch {
    continue;
  }
  if (!page.startsWith("<!-- This file is generated")) error(`categories/${file} is missing its generated-file marker`);
  if (!page.includes(`# ${category}`)) error(`categories/${file} is missing its category heading`);
  if (!page.includes(`**${entries.length.toLocaleString("en-US")}** publication and discovery listings`)) {
    error(`categories/${file} has an incorrect listing count`);
  }
  for (const entry of entries) {
    if (!page.includes(`](${entry.url})`)) error(`categories/${file} is missing ${entry.id}`);
  }
}

for (const candidate of candidates.candidates) {
  if (candidate.status !== "pending-review") error(`${candidate.id}: candidate must remain pending-review`);
  if (urls.has(canonicalUrl(candidate.url).toLowerCase())) error(`${candidate.id}: queued candidate duplicates curated catalog`);
}

const weakGithub = catalog.listings.filter((entry) => entry.platform === "github" && entry.verification.status === "discovery-only").length;
if (weakGithub > catalog.stats.by_platform.github / 2) warning(`${weakGithub} GitHub entries are discovery-only; consider deeper rule verification.`);

for (const message of warnings) console.warn(`WARN: ${message}`);
if (errors.length) {
  for (const message of errors) console.error(`ERROR: ${message}`);
  console.error(`\nValidation failed with ${errors.length} error${errors.length === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.log(
  `Validated ${catalog.listings.length.toLocaleString("en-US")} listings: ` +
  `${ids.size.toLocaleString("en-US")} unique IDs, ${urls.size.toLocaleString("en-US")} unique URLs, ` +
  `README ${readmeStat.size.toLocaleString("en-US")} bytes.`
);
