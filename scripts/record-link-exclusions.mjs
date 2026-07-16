#!/usr/bin/env node

import { readJson, writeJson } from "./lib/common.mjs";

const [report, current] = await Promise.all([
  readJson("reports/link-check.json"),
  readJson("data/exclusions.json")
]);

const byId = new Map(current.exclusions.map((entry) => [entry.listing_id, entry]));
for (const result of report.results.filter((entry) => entry.status === "not-found" && entry.listing_id.startsWith("web-"))) {
  byId.set(result.listing_id, {
    listing_id: result.listing_id,
    url: result.url,
    reason: `HTTP ${result.http_status}`,
    checked_at: report.checked_at
  });
}

const exclusions = [...byId.values()].sort((a, b) => a.listing_id.localeCompare(b.listing_id));
await writeJson("data/exclusions.json", {
  schema_version: "1.0.0",
  updated_at: report.checked_at,
  exclusions
});

console.log(`Recorded ${exclusions.length} explicit link exclusions from ${report.checked_at}.`);
