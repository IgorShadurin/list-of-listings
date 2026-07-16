import { createHash } from "node:crypto";
import { canonicalUrl, cleanText, compact, readJson, slugify, writeJson } from "./common.mjs";

const ALLOWED_TYPES = new Set([
  "ai-tool",
  "api",
  "app",
  "curated-list",
  "dataset-or-model",
  "library",
  "mcp-server",
  "open-source-project",
  "plugin",
  "project",
  "website"
]);

function validHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function validateCandidate(candidate, catalog, candidateQueue = { candidates: [] }) {
  const errors = [];
  const warnings = [];
  const name = cleanText(candidate.name, "");
  const description = cleanText(candidate.description, "");
  const url = canonicalUrl(candidate.url);
  const submissionUrl = canonicalUrl(candidate.submission_url ?? candidate.url);
  const accepts = compact(candidate.accepts ?? []);
  const evidenceUrls = compact(candidate.evidence_urls ?? []);

  if (name.length < 2 || name.length > 120) errors.push("name must contain 2–120 characters");
  if (description.length < 20 || description.length > 600) errors.push("description must contain 20–600 characters");
  if (!validHttpUrl(url)) errors.push("url must be an absolute HTTP(S) URL");
  if (!validHttpUrl(submissionUrl)) errors.push("submission_url must be an absolute HTTP(S) URL");
  if (!accepts.length) errors.push("accepts must contain at least one artifact type");
  const invalidTypes = accepts.filter((type) => !ALLOWED_TYPES.has(type));
  if (invalidTypes.length) errors.push(`unsupported accepts values: ${invalidTypes.join(", ")}`);
  for (const evidenceUrl of evidenceUrls) {
    if (!validHttpUrl(evidenceUrl)) errors.push(`invalid evidence URL: ${evidenceUrl}`);
  }
  if (!evidenceUrls.length) warnings.push("No evidence_urls supplied; rule and submission claims will need manual verification.");

  const canonical = url.toLowerCase();
  const existing = catalog.listings.find((entry) => canonicalUrl(entry.url).toLowerCase() === canonical);
  if (existing) errors.push(`URL already exists in curated catalog as ${existing.id}`);
  const queued = candidateQueue.candidates.find((entry) => canonicalUrl(entry.url).toLowerCase() === canonical);
  if (queued) errors.push(`URL already exists in candidate queue as ${queued.id}`);

  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 8);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized: {
      id: `candidate-${slugify(name)}-${hash}`,
      name,
      description,
      url,
      submission_url: submissionUrl,
      accepts,
      category: cleanText(candidate.category, "Untriaged"),
      platform: cleanText(candidate.platform, "web").toLowerCase(),
      evidence_urls: evidenceUrls,
      notes: cleanText(candidate.notes, "") || null
    }
  };
}

export async function proposeCandidate(candidate, catalog) {
  const queue = await readJson("data/candidates.json");
  const validation = validateCandidate(candidate, catalog, queue);
  if (!validation.valid) return validation;
  const record = {
    ...validation.normalized,
    status: "pending-review",
    submitted_at: new Date().toISOString(),
    submitted_via: "mcp"
  };
  queue.candidates.push(record);
  queue.candidates.sort((a, b) => a.id.localeCompare(b.id));
  await writeJson("data/candidates.json", queue);
  return { ...validation, candidate: record };
}
