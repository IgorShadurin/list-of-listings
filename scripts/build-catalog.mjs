#!/usr/bin/env node

import {
  canonicalUrl,
  categoryFromText,
  cleanText,
  compact,
  daysSince,
  inferAccepts,
  readJson,
  slugify,
  writeJson
} from "./lib/common.mjs";

const [githubSource, webSource, manualSource, verifiedWebSource, exclusionsSource, linkReport] = await Promise.all([
  readJson("data/sources/github-awesome.json"),
  readJson("data/sources/web-directories.json"),
  readJson("data/manual-listings.json"),
  readJson("data/verified-web-listings.json"),
  readJson("data/exclusions.json"),
  readJson("reports/link-check.json").catch(() => null)
]);

const referenceDate = [githubSource.retrieved_at, webSource.retrieved_at]
  .filter(Boolean)
  .sort()
  .at(-1);
const catalogDate = referenceDate.slice(0, 10);
const activeLinkReport = linkReport?.catalog_generated_at === referenceDate ? linkReport : null;
const excludedListingIds = new Set(exclusionsSource.exclusions.map((entry) => entry.listing_id));

const META_LISTS = new Set([
  "sindresorhus/awesome",
  "jnv/lists",
  "trackawesomelist/trackawesomelist",
  "bayandin/awesome-awesomeness",
  "emijrp/awesome-awesome",
  "0ex/more-awesome"
]);

function isMetaList(entry) {
  const text = `${entry.full_name} ${entry.description ?? ""}`.toLowerCase();
  return META_LISTS.has(entry.full_name.toLowerCase()) || /\b(list|collection|directory) of (?:the )?(?:awesome )?lists\b|awesome lists about all/.test(text);
}

function isRelevantGithubListing(entry) {
  if (isMetaList(entry)) return true;
  const identityText = [entry.full_name, entry.description].join(" ").toLowerCase();
  const text = [identityText, ...(entry.topics ?? [])].join(" ").toLowerCase();
  const looksLikeList = /awesome|curated|\blist\b|collection|directory|catalog|resources|ecosystem|landscape/.test(identityText);
  const hasSubmissionSignal = Boolean(entry.contribution) || entry.merged_pull_requests > 0;
  const acceptsProjectArtifacts = /\bapps?\b|\bapplications?\b|software|\btools?\b|\bprojects?\b|\bwebsites?\b|librar(?:y|ies)|framework|packages?|plugins?|extensions?|\bapi\b|datasets?|models?|\bai\b|machine.learning|self.hosted|open.source|developer|services?|saas|\bcli\b|repositor(?:y|ies)|templates?|components?|platforms?|games?|mobile|\bweb\b|mcp/.test(text);
  return looksLikeList && hasSubmissionSignal && acceptsProjectArtifacts;
}

function githubListing(entry) {
  const text = [entry.full_name, entry.description, entry.primary_language, ...(entry.topics ?? [])].join(" ");
  const metaList = isMetaList(entry);
  const contribution = entry.contribution;
  const rules = contribution?.detected_rules ?? {
    minimum_stars: null,
    minimum_project_age_days: null,
    open_source_required: null,
    rules_summary: []
  };
  const daysSincePush = daysSince(entry.pushed_at, referenceDate);
  const daysSinceMerge = daysSince(entry.last_merged_pull_request_at, referenceDate);
  const active = (daysSinceMerge !== null && daysSinceMerge <= 730) || (daysSincePush !== null && daysSincePush <= 365);
  const submissionsPaused = /submissions?.{0,50}(?:paused|closed|not accept)|not accepting.{0,30}submissions?/i.test(entry.description ?? "");
  const submissionSignal = contribution && entry.merged_pull_requests > 0
    ? "strong-signal"
    : contribution || entry.merged_pull_requests > 0
      ? "probable"
      : "discovery-only";

  return {
    id: `github-${slugify(entry.full_name)}`,
    name: entry.full_name,
    description: cleanText(entry.description, `Community-maintained curated list at ${entry.full_name}.`),
    url: canonicalUrl(entry.url),
    platform: "github",
    category: metaList ? "General Project Discovery" : categoryFromText(text),
    accepts: metaList ? ["curated-list"] : inferAccepts(text),
    commercial_allowed: null,
    publication_scope: "directory-listing",
    submission: {
      url: `${entry.url}/pulls`,
      method: "pull-request",
      status: submissionsPaused ? "paused" : active ? "active" : "check-first",
      guidelines_url: contribution?.url ?? null,
      mcp_write_level: "indirect_via_github_mcp",
      cost: "free",
      last_verified: catalogDate
    },
    requirements: {
      minimum_stars: rules.minimum_stars,
      minimum_project_age_days: rules.minimum_project_age_days,
      open_source_required: rules.open_source_required,
      account_required: "GitHub account",
      rules_summary: rules.rules_summary,
      rules_detection: contribution ? "contribution-file" : "not-found"
    },
    automation: {
      machine_submittable: true,
      agent_automatable_via: ["github_mcp", "git"]
    },
    repository: {
      full_name: entry.full_name,
      stars: entry.stars,
      forks: entry.forks,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      pushed_at: entry.pushed_at,
      default_branch: entry.default_branch,
      license: entry.license,
      primary_language: entry.primary_language,
      topics: entry.topics,
      merged_pull_requests: entry.merged_pull_requests,
      open_pull_requests: entry.open_pull_requests,
      last_merged_pull_request_at: entry.last_merged_pull_request_at
    },
    verification: {
      status: submissionSignal,
      checked_at: catalogDate,
      note: "Repository metadata and generic contribution signals were checked automatically; confirm that the proposed project fits the list before opening a PR."
    },
    evidence: compact([
      contribution?.url ? { kind: "submission-rules", url: contribution.url } : null,
      { kind: "github-search", url: "https://github.com/topics/awesome-list" }
    ]),
    source: {
      kind: "github-graphql",
      query: entry.source_query,
      retrieved_at: githubSource.retrieved_at
    },
    tags: compact([...(entry.topics ?? []), metaList ? "meta-list" : null, submissionsPaused ? "submissions-paused" : null, "awesome-list"])
  };
}

function webCategory(sourceCategory) {
  const value = String(sourceCategory ?? "").toLowerCase();
  if (value.includes("ai directory")) return "AI & Machine Learning";
  if (value.includes("api marketplace")) return "Data, Databases & APIs";
  if (value.includes("review")) return "Software Directories & Reviews";
  if (value.includes("press") || value.includes("community") || value.includes("social")) return "Communities & Media";
  if (value.includes("international")) return "Regional Directories";
  if (value.includes("saas marketplace") || value.includes("startup")) return "Launch & Product Directories";
  if (value.includes("software directory")) return "Software Directories & Reviews";
  if (value.includes("acquire") || value.includes("sell")) return "Business & Productivity";
  return "General Project Discovery";
}

function webMethod(url) {
  const value = String(url).toLowerCase();
  if (/reddit\.com|news\.ycombinator\.com|indiehackers\.com/.test(value)) return "community-post";
  if (/submit|add-|\/add\b|signup|sign-up|vendor|\/new\b|become-a/.test(value)) return "web-form";
  return "account-or-web-form";
}

function normalizePricing(value) {
  const text = String(value ?? "unknown").toLowerCase().trim();
  if (!text || text === "null") return "unknown";
  if (text.includes("free") && text.includes("paid")) return "free-or-paid";
  if (text.includes("freemium")) return "freemium";
  if (text.includes("free")) return "free";
  if (text.includes("paid")) return "paid";
  return text.replace(/\s+/g, "-");
}

function webListing(entry) {
  const url = canonicalUrl(entry.url);
  const category = webCategory(entry.category);
  const text = `${entry.name} ${entry.description} ${entry.category}`;
  let accepts = inferAccepts(text);
  if (accepts.length === 1 && accepts[0] === "project") accepts = ["app", "website"];
  if (category === "AI & Machine Learning") accepts = compact(["ai-tool", "app", "website", ...accepts]);
  if (category === "Launch & Product Directories") accepts = compact(["app", "website", ...accepts]);
  let host = "unknown";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* validation reports malformed URLs */ }

  const listing = {
    id: `web-${slugify(entry.name)}-${slugify(host)}`,
    name: cleanText(entry.name),
    description: cleanText(entry.description),
    url,
    platform: "web",
    category,
    accepts,
    commercial_allowed: true,
    publication_scope: "directory-listing",
    submission: {
      url,
      method: webMethod(url),
      status: "source-claimed",
      guidelines_url: null,
      mcp_write_level: "manual_only",
      cost: normalizePricing(entry.pricing),
      last_verified: catalogDate
    },
    requirements: {
      minimum_stars: null,
      minimum_project_age_days: null,
      open_source_required: null,
      account_required: null,
      rules_summary: [],
      rules_detection: "source-metadata-only"
    },
    automation: {
      machine_submittable: false,
      agent_automatable_via: []
    },
    metrics: {
      domain_rating: entry.domain_rating ?? null,
      link_type: entry.link_type ?? null
    },
    verification: {
      status: "source-claimed",
      checked_at: catalogDate,
      note: "Imported from an attributed launch-directory dataset. Pricing and submission availability were not independently verified for every row; check the destination before submitting."
    },
    evidence: [{ kind: "source-dataset", url: webSource.source.data_url }],
    source: {
      kind: "derived-dataset",
      name: webSource.source.name,
      repository: webSource.source.repository,
      commit: webSource.source.commit,
      license: webSource.source.license,
      retrieved_at: webSource.retrieved_at
    },
    tags: compact([slugify(entry.category).replace(/^-|-$/g, ""), "web-directory"])
  };
  const reachability = activeLinkReport?.results?.find((result) => result.listing_id === listing.id && result.kind === "homepage");
  if (reachability) {
    listing.reachability = {
      status: reachability.status,
      http_status: reachability.http_status,
      final_url: reachability.final_url,
      checked_at: activeLinkReport.checked_at
    };
  }
  return listing;
}

function verifiedWebListing(entry) {
  const machineSubmittable = ["api_cli_only", "indirect_via_github_mcp"].includes(entry.automation_level);
  const channels = entry.automation_level === "api_cli_only"
    ? ["cli-or-api"]
    : entry.automation_level === "indirect_via_github_mcp"
      ? ["github_mcp", "git"]
      : [];
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    url: canonicalUrl(entry.url),
    platform: "web",
    category: entry.category,
    accepts: entry.accepts,
    commercial_allowed: entry.commercial_allowed,
    publication_scope: entry.publication_scope,
    submission: {
      url: canonicalUrl(entry.submission_url),
      method: entry.submission_method,
      status: "active",
      guidelines_url: entry.rules_url ? canonicalUrl(entry.rules_url) : null,
      mcp_write_level: entry.automation_level,
      cost: entry.cost,
      last_verified: verifiedWebSource.checked_at
    },
    requirements: {
      minimum_stars: entry.constraints?.minimum_stars ?? null,
      minimum_project_age_days: entry.constraints?.minimum_project_age_days ?? null,
      open_source_required: entry.commercial_allowed === false ? true : null,
      account_required: entry.account_required,
      rules_summary: entry.rules,
      rules_detection: "manual-primary-evidence",
      ...(entry.constraints ?? {})
    },
    automation: {
      machine_submittable: machineSubmittable,
      agent_automatable_via: channels
    },
    verification: {
      status: "verified-primary",
      checked_at: verifiedWebSource.checked_at,
      note: "Submission and rule claims were checked against the linked first-party documentation."
    },
    evidence: entry.evidence_urls.map((url) => ({ kind: "primary-documentation", url })),
    source: {
      kind: "manual-primary-web",
      retrieved_at: `${verifiedWebSource.checked_at}T00:00:00.000Z`
    },
    tags: compact([slugify(entry.category), entry.publication_scope, ...entry.accepts])
  };
}

const eligibleGithubEntries = githubSource.entries.filter(isRelevantGithubListing);
const excludedGithubCandidates = githubSource.entries.length - eligibleGithubEntries.length;
const githubListings = eligibleGithubEntries.map(githubListing);
const githubByUrl = new Map(githubListings.map((entry) => [canonicalUrl(entry.url).toLowerCase(), entry]));

function manualListing(entry) {
  const githubMatch = githubByUrl.get(canonicalUrl(entry.url).toLowerCase());
  return {
    ...entry,
    url: canonicalUrl(entry.url),
    commercial_allowed: entry.commercial_allowed ?? null,
    submission: {
      guidelines_url: null,
      ...entry.submission
    },
    requirements: {
      account_required: null,
      rules_detection: "manual-primary-evidence",
      ...entry.requirements
    },
    repository: githubMatch?.repository,
    verification: {
      status: entry.submission.status,
      checked_at: entry.submission.last_verified,
      note: "Manually curated from the linked primary documentation."
    },
    source: {
      kind: "manual-primary-evidence",
      retrieved_at: `${manualSource.updated_at}T00:00:00.000Z`
    },
    tags: compact(entry.tags ?? [])
  };
}

const combined = [
  ...manualSource.listings.map(manualListing),
  ...verifiedWebSource.listings.map(verifiedWebListing),
  ...githubListings,
  ...webSource.entries.map(webListing)
];

const listings = [];
const urls = new Set();
const ids = new Set();
const verifiedWebDomains = new Set();
let excludedDefiniteDead = 0;
for (const listing of combined) {
  if (
    listing.source?.kind === "derived-dataset" &&
    (excludedListingIds.has(listing.id) || listing.reachability?.status === "not-found")
  ) {
    excludedDefiniteDead += 1;
    continue;
  }
  const key = canonicalUrl(listing.url).toLowerCase();
  let domain = null;
  try { domain = new URL(key).hostname.replace(/^www\./, ""); } catch { /* URL validation reports malformed rows */ }
  if (listing.source?.kind === "derived-dataset" && domain && verifiedWebDomains.has(domain)) continue;
  if (urls.has(key)) continue;
  let id = listing.id;
  let suffix = 2;
  while (ids.has(id)) id = `${listing.id}-${suffix++}`;
  urls.add(key);
  ids.add(id);
  if (listing.source?.kind === "manual-primary-web" && domain) verifiedWebDomains.add(domain);
  listings.push({ ...listing, id });
}

listings.sort((a, b) =>
  a.category.localeCompare(b.category) ||
  (b.repository?.stars ?? -1) - (a.repository?.stars ?? -1) ||
  a.name.localeCompare(b.name)
);

function countBy(field) {
  const counts = new Map();
  for (const listing of listings) {
    const key = listing[field];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  );
}

const accepts = {};
for (const listing of listings) {
  for (const type of listing.accepts) accepts[type] = (accepts[type] ?? 0) + 1;
}

await writeJson("data/listings.json", {
  $schema: "../schemas/catalog.schema.json",
  schema_version: "1.0.0",
  generated_at: referenceDate,
  catalog_date: catalogDate,
  stats: {
    total: listings.length,
    by_platform: countBy("platform"),
    by_category: countBy("category"),
    by_accepted_type: Object.fromEntries(Object.entries(accepts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    with_documented_rules: listings.filter((entry) => entry.requirements.rules_summary.length > 0 || entry.submission.guidelines_url).length,
    verified_primary: listings.filter((entry) => entry.verification.status.startsWith("verified")).length,
    mcp_native_write: listings.filter((entry) => ["native_write", "native_write_general_api"].includes(entry.submission.mcp_write_level)).length,
    excluded_definite_dead: excludedDefiniteDead,
    excluded_github_candidates: excludedGithubCandidates,
    github_stars_total: listings.reduce((sum, entry) => sum + (entry.repository?.stars ?? 0), 0)
  },
  sources: [
    githubSource.source,
    webSource.source,
    {
      name: "Manual primary-source MCP research",
      checked_at: manualSource.updated_at,
      entries: manualSource.listings.length
    },
    {
      name: "Manual primary-source web research",
      checked_at: verifiedWebSource.checked_at,
      entries: verifiedWebSource.listings.length
    },
    {
      name: "Explicit dead-link exclusions",
      checked_at: exclusionsSource.updated_at,
      entries: exclusionsSource.exclusions.length
    },
    ...(activeLinkReport ? [{
      name: "Catalog link reachability report",
      checked_at: activeLinkReport.checked_at,
      summary: activeLinkReport.summary
    }] : [])
  ],
  methodology: {
    inclusion: "Active, non-fork GitHub awesome-list repositories with list semantics, an artifact-fit signal, and a contribution signal; an attributed web launch-directory dataset; and manually verified web and MCP publishing channels.",
    caveat: "A catalog entry is a discovery lead, not an acceptance guarantee. Re-check the linked rules before submitting.",
    unknown_values: "Unknown requirements are null, never assumed to be zero or false."
  },
  listings
});

console.log(`Built data/listings.json with ${listings.length} deduplicated listings.`);
