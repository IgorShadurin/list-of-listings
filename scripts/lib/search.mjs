import { categoryFromText, cleanText, inferAccepts } from "./common.mjs";

function tokens(value) {
  return cleanText(value, "")
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((token) => token.length > 1);
}

function scoreListing(listing, query) {
  const terms = tokens(query);
  if (!terms.length) return 0;
  const fields = [
    [listing.id, 7],
    [listing.name, 6],
    [listing.accepts.join(" "), 5],
    [listing.category, 4],
    [listing.description, 3],
    [(listing.tags ?? []).join(" "), 2],
    [(listing.repository?.topics ?? []).join(" "), 2],
    [(listing.requirements?.rules_summary ?? []).join(" "), 1]
  ].map(([value, weight]) => [String(value ?? "").toLowerCase(), weight]);

  let score = 0;
  for (const term of terms) {
    let matched = false;
    for (const [value, weight] of fields) {
      if (value.includes(term)) {
        score += weight;
        matched = true;
      }
    }
    if (!matched) return -1;
  }
  return score;
}

function includesLoose(value, expected) {
  return String(value ?? "").toLowerCase().includes(String(expected).toLowerCase());
}

export function searchListings(listings, options = {}) {
  const {
    query = "",
    id,
    platform,
    category,
    accepts,
    cost,
    status,
    mcpWrite,
    minStars,
    maxStars,
    limit = 20
  } = options;

  const acceptedTypes = Array.isArray(accepts)
    ? accepts
    : String(accepts ?? "").split(",").map((item) => item.trim()).filter(Boolean);

  return listings
    .map((listing) => ({ listing, score: scoreListing(listing, query) }))
    .filter(({ listing, score }) => {
      if (score < 0) return false;
      if (id && listing.id !== id) return false;
      if (platform && !includesLoose(listing.platform, platform)) return false;
      if (category && !includesLoose(listing.category, category)) return false;
      if (acceptedTypes.length && !acceptedTypes.every((type) => listing.accepts.includes(type))) return false;
      if (cost && !includesLoose(listing.submission?.cost, cost)) return false;
      if (status && !includesLoose(listing.verification?.status, status) && !includesLoose(listing.submission?.status, status)) return false;
      if (mcpWrite) {
        const level = listing.submission?.mcp_write_level ?? "";
        if (mcpWrite === "native" && !["native_write", "native_write_general_api"].includes(level)) return false;
        if (mcpWrite !== "native" && !includesLoose(level, mcpWrite)) return false;
      }
      const stars = listing.repository?.stars ?? 0;
      if (Number.isFinite(minStars) && stars < minStars) return false;
      if (Number.isFinite(maxStars) && stars > maxStars) return false;
      return true;
    })
    .sort((a, b) =>
      b.score - a.score ||
      (b.listing.repository?.stars ?? b.listing.metrics?.domain_rating ?? 0) -
        (a.listing.repository?.stars ?? a.listing.metrics?.domain_rating ?? 0) ||
      a.listing.name.localeCompare(b.listing.name)
    )
    .slice(0, Math.max(1, Math.min(Number(limit) || 20, 500)))
    .map(({ listing, score }) => ({ ...listing, _score: score }));
}

export function recommendListings(listings, project = {}) {
  const context = [project.name, project.description, ...(project.tags ?? [])].filter(Boolean).join(" ");
  const inferred = inferAccepts(context);
  const preferredType = project.type ?? (project.ai === true ? "ai-tool" : inferred[0]);
  const inferredCategory = categoryFromText(context);
  const query = (project.tags ?? []).slice(0, 3).join(" ");
  const base = {
    query,
    accepts: preferredType ? [preferredType] : [],
    platform: project.platform,
    mcpWrite: project.publish_via_mcp ? "native" : undefined,
    minStars: project.minimum_listing_stars,
    limit: Math.min((project.limit ?? 20) * 4, 200)
  };

  let matches = searchListings(listings, { ...base, category: inferredCategory });
  if (!matches.length) matches = searchListings(listings, base);

  return matches
    .map((listing) => ({
      listing,
      preference:
        (project.commercial === true && listing.commercial_allowed === true ? 3 : 0) +
        (project.open_source === true && listing.platform === "github" ? 2 : 0) +
        (listing.category === inferredCategory ? 1 : 0)
    }))
    .sort((a, b) => b.preference - a.preference || b.listing._score - a.listing._score)
    .slice(0, project.limit ?? 20)
    .map(({ listing }) => listing);
}
