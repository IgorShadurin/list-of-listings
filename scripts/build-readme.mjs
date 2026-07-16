#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { formatNumber, markdownEscape, readJson, ROOT, slugify } from "./lib/common.mjs";

const catalog = await readJson("data/listings.json");
const { listings, stats } = catalog;

function truncate(value, length) {
  const text = markdownEscape(value);
  return text.length <= length ? text : `${text.slice(0, length - 1).trim()}…`;
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : "unknown";
}

function displayAccepts(values) {
  return values
    .slice(0, 3)
    .map((value) => value.replaceAll("-", " "))
    .join(", ");
}

function ruleText(entry) {
  if (entry.submission.status === "paused") return "Submissions are marked paused; check the repository before proposing.";
  const parts = [];
  const rules = entry.requirements ?? {};
  if (Number.isFinite(rules.minimum_stars)) parts.push(`≥${formatNumber(rules.minimum_stars)} stars`);
  if (Number.isFinite(rules.minimum_project_age_days)) parts.push(`≥${formatNumber(rules.minimum_project_age_days)} days old`);
  if (rules.open_source_required === true) parts.push("open source required");
  if (rules.rules_summary?.length) parts.push(rules.rules_summary[0]);
  if (!parts.length) parts.push(entry.verification?.status === "source-claimed" ? "verify current rules" : "no hard threshold detected");
  return truncate(parts.join("; "), 72);
}

function submissionText(entry) {
  const method = entry.submission.method.replaceAll("-", " ");
  const links = [`[${markdownEscape(method)}](${entry.submission.url})`];
  if (entry.submission.guidelines_url) links.push(`[rules](${entry.submission.guidelines_url})`);
  const cost = entry.submission.cost;
  if (cost && !["free", "unknown", "not stated"].includes(cost)) links.push(markdownEscape(cost.replaceAll("-", " ")));
  return `${links.join(" · ")}<br><sub>${ruleText(entry)}</sub>`;
}

function signalText(entry) {
  if (entry.repository) {
    return `⭐ ${formatNumber(entry.repository.stars)}<br><sub>created ${dateOnly(entry.repository.created_at)} · pushed ${dateOnly(entry.repository.pushed_at)}</sub>`;
  }
  if (entry.submission.mcp_write_level && entry.submission.mcp_write_level !== "manual_only") {
    return `MCP: ${markdownEscape(entry.submission.mcp_write_level.replaceAll("_", " "))}<br><sub>${markdownEscape(entry.verification.status)}</sub>`;
  }
  const metrics = [];
  if (Number.isFinite(entry.metrics?.domain_rating)) metrics.push(`DR ${entry.metrics.domain_rating}`);
  if (entry.metrics?.link_type) metrics.push(entry.metrics.link_type);
  return `${metrics.join(" · ") || markdownEscape(entry.verification?.status ?? "unknown")}<br><sub>checked ${dateOnly(entry.verification?.checked_at)}</sub>`;
}

function listingRow(entry) {
  const name = truncate(entry.name, 54);
  const description = truncate(entry.description, 92);
  return `| [${name}](${entry.url})<br><sub>${description}</sub> | ${markdownEscape(displayAccepts(entry.accepts))} | ${submissionText(entry)} | ${signalText(entry)} |`;
}

function table(entries) {
  return [
    "| Listing | Accepts | How to submit / detected rules | Signals |",
    "|---|---|---|---|",
    ...entries.map(listingRow)
  ].join("\n");
}

function compactRuleText(entry) {
  if (entry.submission.status === "paused") return "PAUSED";
  const parts = [];
  const rules = entry.requirements ?? {};
  if (Number.isFinite(rules.minimum_stars)) parts.push(`≥${formatNumber(rules.minimum_stars)}★`);
  if (Number.isFinite(rules.minimum_project_age_days)) parts.push(`≥${formatNumber(rules.minimum_project_age_days)}d`);
  if (rules.open_source_required === true) parts.push("OSS only");
  if (!parts.length && rules.rules_summary?.length) parts.push(rules.rules_summary[0]);
  if (!parts.length) parts.push(entry.verification?.status === "source-claimed" ? "verify rules" : "no threshold detected");
  return truncate(parts.join("; "), 15);
}

function compactRow(entry) {
  const rulesLink = entry.submission.guidelines_url ? ` · [rules](${entry.submission.guidelines_url})` : "";
  const signal = entry.repository
    ? `⭐ ${formatNumber(entry.repository.stars)} · ${dateOnly(entry.repository.created_at)}`
    : Number.isFinite(entry.metrics?.domain_rating)
      ? `DR ${entry.metrics.domain_rating}`
      : truncate(entry.submission.mcp_write_level ?? entry.verification.status, 26);
  return `| [${truncate(entry.name, 32)}](${entry.url}) — ${truncate(entry.description, 24)} | ${markdownEscape(displayAccepts(entry.accepts.slice(0, 1)))} | [submit](${entry.submission.url})${rulesLink} · ${compactRuleText(entry)} | ${signal} |`;
}

function compactTable(entries) {
  return [
    "| Listing and description | Accepts | Submit and rules | Stars/created or web signal |",
    "|---|---|---|---|",
    ...entries.map(compactRow)
  ].join("\n");
}

const categories = [...new Set(listings.map((entry) => entry.category))];
const mcpCurated = listings.filter((entry) =>
  entry.category === "MCP & Agent Publishing" && entry.source?.kind === "manual-primary-evidence"
);
const topGithub = listings
  .filter((entry) => entry.repository && entry.submission.status === "active" && entry.accepts.some((type) => type !== "curated-list"))
  .sort((a, b) => b.repository.stars - a.repository.stars)
  .slice(0, 15);
const aiHighlights = listings
  .filter((entry) => entry.accepts.includes("ai-tool"))
  .sort((a, b) => (b.repository?.stars ?? b.metrics?.domain_rating ?? 0) - (a.repository?.stars ?? a.metrics?.domain_rating ?? 0))
  .slice(0, 15);

const lines = [];
lines.push("<!-- This file is generated by scripts/build-readme.mjs. Edit data or scripts, then run npm run build. -->");
lines.push("");
lines.push("<div align=\"center\">");
lines.push("");
lines.push("# List of Listings");
lines.push("");
lines.push("**Where to publish, launch, and promote apps, sites, libraries, AI tools, MCP servers, and open-source projects.**");
lines.push("");
lines.push(`[![Listings](https://img.shields.io/badge/listings-${stats.total.toLocaleString("en-US").replaceAll(",", "%2C")}-5b5bd6?style=for-the-badge)](data/listings.json)`);
lines.push(`[![GitHub lists](https://img.shields.io/badge/GitHub_lists-${stats.by_platform.github ?? 0}-181717?style=for-the-badge&logo=github)](#complete-catalog)`);
lines.push(`[![Web channels](https://img.shields.io/badge/web_channels-${stats.by_platform.web ?? 0}-0ea5e9?style=for-the-badge)](#complete-catalog)`);
lines.push(`[![MCP native writes](https://img.shields.io/badge/MCP_native_writes-${stats.mcp_native_write}-8b5cf6?style=for-the-badge)](#mcp-curated-agent-ready-publishing)`);
lines.push("");
lines.push(`[Browse the JSON](data/listings.json) · [Search from the terminal](#search-and-automate) · [Connect through MCP](#mcp-server) · [Contribute](CONTRIBUTING.md)`);
lines.push("");
lines.push("</div>");
lines.push("");
lines.push("> [!IMPORTANT]");
lines.push("> A listing is a submission lead, not an acceptance guarantee. Rules, prices, queues, and submission status change. Check the linked destination before publishing, and never automate voting, CAPTCHA bypass, or unsolicited mass submissions.");
lines.push("");
lines.push("## Complete catalog");
lines.push("");
lines.push(`Browse all **${formatNumber(stats.total)}** entries by category. Every category is expanded by default; select its heading to collapse or reopen it. Descriptions are compact here, while full records and provenance live in [\`data/listings.json\`](data/listings.json).`);
lines.push("");
lines.push("### Categories");
lines.push("");
lines.push("| Category | Listings |");
lines.push("|---|---:|");
for (const category of categories) {
  const count = listings.filter((entry) => entry.category === category).length;
  lines.push(`| [${markdownEscape(category)}](#${slugify(category)}) | ${formatNumber(count)} |`);
}
lines.push("");
for (const category of categories) {
  const entries = listings.filter((entry) => entry.category === category);
  lines.push(`<details open id=\"${slugify(category)}\">`);
  lines.push(`<summary><strong>${markdownEscape(category)}</strong> — ${formatNumber(entries.length)} listings</summary>`);
  lines.push("");
  lines.push(compactTable(entries));
  lines.push("");
  lines.push("</details>");
  lines.push("");
}
lines.push("## At a glance");
lines.push("");
lines.push("| Catalog | Count | What it means |");
lines.push("|---|---:|---|");
lines.push(`| All deduplicated listings | **${formatNumber(stats.total)}** | GitHub curated lists, web launch channels, and MCP publishing targets |`);
lines.push(`| GitHub-hosted curated lists | **${formatNumber(stats.by_platform.github ?? 0)}** | Active, non-fork awesome-list repositories found with recorded \`gh\` queries |`);
lines.push(`| Web directories and communities | **${formatNumber(stats.by_platform.web ?? 0)}** | Imported from an attributed open dataset; individual availability needs rechecking |`);
lines.push(`| Listings with rules or a rules link | **${formatNumber(stats.with_documented_rules)}** | A contribution file, hard rule, or manually verified requirement is available |`);
lines.push(`| Primary-source verified channels | **${formatNumber(stats.verified_primary)}** | High-value web and MCP targets checked against first-party publishing documentation |`);
lines.push(`| MCP-native write targets | **${formatNumber(stats.mcp_native_write)}** | The documented workflow can publish through an MCP tool, not merely discover through MCP |`);
lines.push(`| Definite dead links excluded | **${formatNumber(stats.excluded_definite_dead)}** | Source-claimed web rows still returning HTTP 404 or 410 after a GET retry were removed |`);
lines.push(`| Off-topic GitHub candidates excluded | **${formatNumber(stats.excluded_github_candidates)}** | Topic matches lacking list semantics, project-artifact fit, or a contribution signal were removed |`);
lines.push(`| GitHub stars represented | **${formatNumber(stats.github_stars_total)}** | Popularity signal only; stars do not prove acceptance |`);
lines.push("");
lines.push("### Choose a path");
lines.push("");
lines.push("| You are publishing… | Start with | Useful filter |");
lines.push("|---|---|---|");
lines.push("| An open-source library or developer tool | GitHub curated lists + package registries in web channels | `npm run search -- --accepts library --platform github` |");
lines.push("| A commercial app, SaaS, or website | Launch and product directories | `npm run search -- --category launch --accepts app --platform web` |");
lines.push("| An AI tool, open or commercial | AI directories and AI-focused awesome lists | `npm run search -- --accepts ai-tool` |");
lines.push("| An MCP server | Official registry, MCP directories, Docker/Cline lists | `npm run search -- --accepts mcp-server` |");
lines.push("| A site or app directly from an agent | MCP-native hosting/deployment targets | `npm run search -- --mcp-write native` |");
lines.push("| This catalog or another curated list | Meta-lists | `npm run search -- --accepts curated-list` |");
lines.push("");
lines.push("## Search and automate");
lines.push("");
lines.push("The generated [`data/listings.json`](data/listings.json) file is the source for machines. Search uses all text fields and supports composable filters:");
lines.push("");
lines.push("```bash");
lines.push("npm install");
lines.push("npm run search -- --query \"python machine learning\" --accepts library --min-stars 100");
lines.push("npm run search -- --platform web --category \"AI\" --cost free --limit 25");
lines.push("npm run search -- --mcp-write native --accepts website --json");
lines.push("```");
lines.push("");
lines.push("Run `npm run search -- --help` for every filter. The model is explained in [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md), described by [`schemas/catalog.schema.json`](schemas/catalog.schema.json), and checked with `npm run validate`.");
lines.push("");
lines.push("### MCP server");
lines.push("");
lines.push("This repository is itself **MCP-curated**. Its local stdio server lets an agent search and recommend channels, inspect one entry, validate a proposed listing, and add a proposal to the review queue:");
lines.push("");
lines.push("- `search_listings` — ranked full-text search with platform, category, accepted-type, cost, and MCP filters.");
lines.push("- `get_listing` — return one complete record by stable ID.");
lines.push("- `recommend_listings` — match a project description and publishing needs to suitable channels.");
lines.push("- `validate_listing` — check a candidate without changing files.");
lines.push("- `propose_listing` — append a deduplicated, pending-review candidate to `data/candidates.json`; it never silently enters the curated catalog.");
lines.push("");
lines.push("```json");
lines.push("{");
lines.push("  \"mcpServers\": {");
lines.push("    \"list-of-listings\": {");
lines.push("      \"command\": \"npm\",");
lines.push("      \"args\": [\"run\", \"mcp\", \"--silent\"],");
lines.push("      \"cwd\": \"/absolute/path/to/list-of-listings\"");
lines.push("    }");
lines.push("  }");
lines.push("}");
lines.push("```");
lines.push("");
lines.push("## MCP-curated, agent-ready publishing");
lines.push("");
lines.push("`MCP-native` means an MCP tool can perform the write. `MCP workflow` means MCP guides or invokes a companion CLI. `Indirect via GitHub MCP` means an agent can prepare an issue or PR, but the target itself has no native MCP submission tool. Ordinary MCP directories are not mislabeled as MCP-writable.");
lines.push("");
lines.push(table(mcpCurated));
lines.push("");
lines.push("## Highlights");
lines.push("");
lines.push("### Popular GitHub lists");
lines.push("");
lines.push(table(topGithub));
lines.push("");
lines.push("### AI discovery channels");
lines.push("");
lines.push(table(aiHighlights));
lines.push("");
lines.push("## Reading the evidence");
lines.push("");
lines.push("| Status | Interpretation |");
lines.push("|---|---|");
lines.push("| `verified*` | Manually checked against linked primary documentation on the catalog date. Qualifiers such as beta or partial still matter. |");
lines.push("| `strong-signal` | GitHub has a detected contribution file and merged-PR activity. The project-fit rules still need human review. |");
lines.push("| `probable` | GitHub has either documented contribution guidance or merged-PR activity. Listing-specific acceptance is not guaranteed. |");
lines.push("| `discovery-only` | Found through the awesome-list topic, without enough automated evidence to claim open submissions. Check first. |");
lines.push("| `source-claimed` | An attributed dataset says the web channel accepts listings; this project has not manually reverified that individual row. |");
lines.push("");
lines.push("Unknown thresholds are stored as `null`, not `0` or `false`. Repository creation dates, first releases, and a venue's minimum project-age rule are separate facts.");
lines.push("");
lines.push("## Methodology and maintenance");
lines.push("");
lines.push("- GitHub records come from explicit GraphQL queries in [`config/github-sources.json`](config/github-sources.json), collected through `gh`. Archived repositories and forks are excluded. Topic matches must also show list semantics, project-artifact fit, and a contribution signal; activity remains visible so stale venues can be judged.");
lines.push("- Contribution-rule detection is conservative. It reads common contribution-file locations and extracts only explicit patterns. A missing detected rule means “unknown,” not “no rules.”");
lines.push("- Web records are normalized from the MIT-licensed [Startup Launch List](https://github.com/volodstaimi/Startup-Launch-List) snapshot identified in the JSON source metadata. They are clearly labeled `source-claimed` until individually verified; those rows are excluded when both HEAD and GET confirm HTTP 404 or 410.");
lines.push("- MCP entries were checked against linked first-party documentation. The model separates native MCP writes, MCP/CLI workflows, REST/CLI publication, GitHub-MCP-assisted PRs, and manual-only forms.");
lines.push("- URLs are canonicalized and deduplicated. Run `npm run check:links` for a fresh reachability report, `npm run validate` for data invariants, and `npm run build` to regenerate this README.");
lines.push("");
lines.push("## Contributing");
lines.push("");
lines.push("Read [`CONTRIBUTING.md`](CONTRIBUTING.md). You can edit the curated manual source, open a normal pull request, or use the MCP `propose_listing` tool. Every proposal needs an actionable submission URL and evidence for any claimed rule. Do not edit generated files by hand.");
lines.push("");
lines.push("## Attribution");
lines.push("");
lines.push("Third-party source and license details are preserved in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and inside `data/listings.json`. Repository metadata remains attributable to GitHub and its respective owners. Descriptions and detected rules are compact factual summaries, not copied contribution documents.");
lines.push("");
lines.push(`_Catalog snapshot: ${catalog.catalog_date}. Generated from schema version ${catalog.schema_version}._`);

const output = `${lines.join("\n")}\n`;
await writeFile(resolve(ROOT, "README.md"), output);
console.log(`Built README.md (${Buffer.byteLength(output).toLocaleString("en-US")} bytes).`);
