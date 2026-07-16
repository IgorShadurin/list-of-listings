#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { detectRules, readJson, writeJson } from "./lib/common.mjs";

const run = promisify(execFile);
const args = new Set(process.argv.slice(2));
const githubOnly = args.has("--github-only");
const webOnly = args.has("--web-only");

if (githubOnly && webOnly) {
  throw new Error("Choose either --github-only or --web-only, not both.");
}

const GRAPHQL = String.raw`
  query CatalogPage($q: String!, $first: Int!, $after: String) {
    search(query: $q, type: REPOSITORY, first: $first, after: $after) {
      repositoryCount
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on Repository {
          nameWithOwner
          url
          description
          stargazerCount
          forkCount
          createdAt
          updatedAt
          pushedAt
          isArchived
          isFork
          isTemplate
          defaultBranchRef { name }
          licenseInfo { spdxId }
          primaryLanguage { name }
          repositoryTopics(first: 20) { nodes { topic { name } } }
          contributionUpper: object(expression: "HEAD:CONTRIBUTING.md") { ... on Blob { byteSize text } }
          contributionLower: object(expression: "HEAD:contributing.md") { ... on Blob { byteSize text } }
          contributionGithubUpper: object(expression: "HEAD:.github/CONTRIBUTING.md") { ... on Blob { byteSize text } }
          contributionGithubLower: object(expression: "HEAD:.github/contributing.md") { ... on Blob { byteSize text } }
          pullRequests(states: MERGED, first: 1, orderBy: { field: UPDATED_AT, direction: DESC }) {
            totalCount
            nodes { mergedAt }
          }
          openPullRequests: pullRequests(states: OPEN, first: 1) { totalCount }
        }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`;

function isoNow() {
  return new Date().toISOString();
}

async function ghJson(parameters, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { stdout } = await run("gh", parameters, { maxBuffer: 64 * 1024 * 1024 });
      return JSON.parse(stdout);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delay = attempt * 1_500;
      console.warn(`GitHub request failed (attempt ${attempt}/${attempts}); retrying in ${delay}ms.`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function contributionFor(node) {
  const candidates = [
    ["CONTRIBUTING.md", node.contributionUpper],
    ["contributing.md", node.contributionLower],
    [".github/CONTRIBUTING.md", node.contributionGithubUpper],
    [".github/contributing.md", node.contributionGithubLower]
  ];
  const [path, blob] = candidates.find(([, value]) => value) ?? [];
  if (!path) return null;
  const branch = node.defaultBranchRef?.name;
  return {
    path,
    url: branch ? `${node.url}/blob/${encodeURIComponent(branch)}/${path}` : `${node.url}/blob/HEAD/${path}`,
    byte_size: blob.byteSize,
    detected_rules: detectRules(blob.text ?? "")
  };
}

function normalizeGithubNode(node, sourceQuery) {
  return {
    full_name: node.nameWithOwner,
    url: node.url,
    description: node.description,
    stars: node.stargazerCount,
    forks: node.forkCount,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
    pushed_at: node.pushedAt,
    archived: node.isArchived,
    fork: node.isFork,
    template: node.isTemplate,
    default_branch: node.defaultBranchRef?.name ?? null,
    license: node.licenseInfo?.spdxId ?? null,
    primary_language: node.primaryLanguage?.name ?? null,
    topics: (node.repositoryTopics?.nodes ?? []).map((item) => item.topic.name).sort(),
    merged_pull_requests: node.pullRequests?.totalCount ?? 0,
    last_merged_pull_request_at: node.pullRequests?.nodes?.[0]?.mergedAt ?? null,
    open_pull_requests: node.openPullRequests?.totalCount ?? 0,
    contribution: contributionFor(node),
    source_query: sourceQuery
  };
}

async function refreshGithub() {
  const config = await readJson("config/github-sources.json");
  const collected = new Map();
  const queryStats = [];

  for (const source of config.queries) {
    let cursor = null;
    let fetched = 0;
    let page = 0;
    let repositoryCount = null;

    while (fetched < source.limit) {
      const pageSize = Math.min(config.page_size, source.limit - fetched);
      const parameters = [
        "api",
        "graphql",
        "-f",
        `query=${GRAPHQL}`,
        "-F",
        `q=${source.query}`,
        "-F",
        `first=${pageSize}`
      ];
      if (cursor) parameters.push("-F", `after=${cursor}`);

      const response = await ghJson(parameters);
      if (response.errors?.length) throw new Error(JSON.stringify(response.errors));
      const search = response.data.search;
      repositoryCount ??= search.repositoryCount;
      page += 1;

      for (const node of search.nodes) {
        const normalized = normalizeGithubNode(node, source.name);
        if (!collected.has(normalized.full_name.toLowerCase())) {
          collected.set(normalized.full_name.toLowerCase(), normalized);
        }
      }

      fetched += search.nodes.length;
      cursor = search.pageInfo.endCursor;
      console.log(
        `[github] ${source.name}: page ${page}, fetched ${fetched}/${source.limit}, ` +
        `catalog unique ${collected.size}, API remaining ${response.data.rateLimit.remaining}`
      );

      if (!search.pageInfo.hasNextPage || search.nodes.length === 0) break;
    }

    queryStats.push({
      name: source.name,
      query: source.query,
      repository_count_at_refresh: repositoryCount,
      requested_limit: source.limit,
      fetched
    });
  }

  await writeJson("data/sources/github-awesome.json", {
    schema_version: "1.0.0",
    retrieved_at: isoNow(),
    source: {
      name: "GitHub GraphQL API",
      url: "https://docs.github.com/en/graphql",
      topic: "awesome-list",
      queries: queryStats
    },
    entries: [...collected.values()].sort((a, b) => b.stars - a.stars || a.full_name.localeCompare(b.full_name))
  });
  console.log(`[github] wrote ${collected.size} unique repositories.`);
}

async function refreshWeb() {
  const repository = "volodstaimi/Startup-Launch-List";
  const path = "data/directories.json";
  const [content, commit] = await Promise.all([
    run("gh", ["api", `repos/${repository}/contents/${path}`, "-H", "Accept: application/vnd.github.raw+json"], {
      maxBuffer: 32 * 1024 * 1024
    }),
    ghJson(["api", `repos/${repository}/commits/HEAD`])
  ]);
  const entries = JSON.parse(content.stdout);

  await writeJson("data/sources/web-directories.json", {
    schema_version: "1.0.0",
    retrieved_at: isoNow(),
    source: {
      name: "Startup Launch List",
      repository: `https://github.com/${repository}`,
      data_url: `https://github.com/${repository}/blob/${commit.sha}/${path}`,
      commit: commit.sha,
      commit_date: commit.commit?.committer?.date ?? null,
      license: "MIT",
      license_url: `https://github.com/${repository}/blob/${commit.sha}/LICENSE`
    },
    entries
  });
  console.log(`[web] wrote ${entries.length} sourced web directories at ${commit.sha.slice(0, 12)}.`);
}

if (!webOnly) await refreshGithub();
if (!githubOnly) await refreshWeb();
