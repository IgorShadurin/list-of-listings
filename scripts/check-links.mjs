#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import { readJson, writeJson } from "./lib/common.mjs";

function parseArgs(argv) {
  const options = { concurrency: 24, timeout: 8000, includeSubmission: false, strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--include-submission") options.includeSubmission = true;
    else if (arg === "--strict") options.strict = true;
    else if (["--platform", "--category", "--limit", "--concurrency", "--timeout"].includes(arg)) {
      const value = argv[++index];
      if (value === undefined) throw new Error(`Missing value for ${arg}`);
      const key = {
        "--platform": "platform",
        "--category": "category",
        "--limit": "limit",
        "--concurrency": "concurrency",
        "--timeout": "timeout"
      }[arg];
      options[key] = ["limit", "concurrency", "timeout"].includes(key) ? Number(value) : value;
    } else if (["-h", "--help"].includes(arg)) {
      console.log(`Usage: npm run check:links -- [options]

  --platform NAME       Filter by platform
  --category TEXT       Filter by category substring
  --limit N             Check only the first N selected listings
  --concurrency N       Concurrent requests (default: 24)
  --timeout MS          Per-request timeout (default: 8000)
  --include-submission  Check distinct submission URLs too
  --strict              Exit nonzero on 404, 410, network failure, or 5xx
`);
      process.exit(0);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function classify(status) {
  if (status >= 200 && status < 400) return "reachable";
  if ([401, 403, 429].includes(status)) return "protected-or-rate-limited";
  if ([404, 410].includes(status)) return "not-found";
  if (status >= 400 && status < 500) return "client-error";
  if (status >= 500) return "server-error";
  return "unknown";
}

async function request(url, method, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "list-of-listings-link-check/1.0 (+https://github.com/IgorShadurin/list-of-listings)",
        ...(method === "GET" ? { Range: "bytes=0-0" } : {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function checkTarget(target, timeout) {
  const started = performance.now();
  try {
    let response = await request(target.url, "HEAD", timeout);
    if ([404, 405, 410, 501].includes(response.status)) response = await request(target.url, "GET", timeout);
    return {
      ...target,
      status: classify(response.status),
      http_status: response.status,
      final_url: response.url,
      duration_ms: Math.round(performance.now() - started),
      error: null
    };
  } catch (error) {
    return {
      ...target,
      status: error.name === "AbortError" ? "timeout" : "network-error",
      http_status: null,
      final_url: null,
      duration_ms: Math.round(performance.now() - started),
      error: error.message
    };
  }
}

const options = parseArgs(process.argv.slice(2));
const catalog = await readJson("data/listings.json");
let selected = catalog.listings.filter((entry) =>
  (!options.platform || entry.platform.toLowerCase().includes(options.platform.toLowerCase())) &&
  (!options.category || entry.category.toLowerCase().includes(options.category.toLowerCase()))
);
if (Number.isFinite(options.limit)) selected = selected.slice(0, options.limit);

const targets = [];
const seen = new Set();
for (const listing of selected) {
  const candidates = [{ kind: "homepage", url: listing.url }];
  if (options.includeSubmission && listing.submission.url !== listing.url) {
    candidates.push({ kind: "submission", url: listing.submission.url });
  }
  for (const candidate of candidates) {
    const key = candidate.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ listing_id: listing.id, ...candidate });
  }
}

const results = new Array(targets.length);
let next = 0;
let completed = 0;
async function worker() {
  while (true) {
    const index = next++;
    if (index >= targets.length) return;
    results[index] = await checkTarget(targets[index], options.timeout);
    completed += 1;
    if (completed % 100 === 0 || completed === targets.length) {
      console.log(`[links] checked ${completed}/${targets.length}`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(options.concurrency, targets.length) }, worker));
const summary = {};
for (const result of results) summary[result.status] = (summary[result.status] ?? 0) + 1;

await writeJson("reports/link-check.json", {
  schema_version: "1.0.0",
  checked_at: new Date().toISOString(),
  catalog_generated_at: catalog.generated_at,
  options,
  target_count: targets.length,
  summary,
  results
});

console.log(JSON.stringify(summary, null, 2));
console.log("Wrote reports/link-check.json.");

const failures = (summary["not-found"] ?? 0) + (summary["server-error"] ?? 0) +
  (summary.timeout ?? 0) + (summary["network-error"] ?? 0);
if (options.strict && failures) process.exit(1);
