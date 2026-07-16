#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { proposeCandidate, validateCandidate } from "../scripts/lib/candidates.mjs";
import { readJson } from "../scripts/lib/common.mjs";
import { recommendListings, searchListings } from "../scripts/lib/search.mjs";

const catalog = await readJson("data/listings.json");

const server = new McpServer(
  { name: "list-of-listings", version: catalog.schema_version },
  {
    instructions:
      "Use search_listings or recommend_listings before get_listing. " +
      "Use validate_listing before propose_listing. Proposals enter a review queue and are never auto-curated."
  }
);

function result(value, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    isError
  };
}

const acceptsSchema = z.enum([
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

const candidateSchema = {
  name: z.string().min(2).max(120).describe("Listing venue name"),
  description: z.string().min(20).max(600).describe("Factual description of the venue"),
  url: z.string().url().describe("Canonical homepage or listing URL"),
  submission_url: z.string().url().optional().describe("Actionable submission URL; defaults to url"),
  accepts: z.array(acceptsSchema).min(1).describe("Artifact types the venue accepts"),
  category: z.string().optional(),
  platform: z.string().optional(),
  evidence_urls: z.array(z.string().url()).optional().describe("Primary pages supporting submission or rule claims"),
  notes: z.string().max(1000).optional()
};

server.registerTool(
  "search_listings",
  {
    title: "Search publication listings",
    description: "Search the curated catalog with ranked text and structured filters.",
    inputSchema: z.object({
      query: z.string().optional(),
      platform: z.string().optional(),
      category: z.string().optional(),
      accepts: z.array(acceptsSchema).optional(),
      cost: z.string().optional(),
      status: z.string().optional(),
      mcp_write: z.string().optional().describe("Use native for direct MCP writes"),
      min_stars: z.number().int().nonnegative().optional(),
      limit: z.number().int().min(1).max(100).default(20)
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async (input) => result({
    results: searchListings(catalog.listings, {
      ...input,
      mcpWrite: input.mcp_write,
      minStars: input.min_stars
    })
  })
);

server.registerTool(
  "get_listing",
  {
    title: "Get one listing",
    description: "Return a complete listing record by stable catalog ID.",
    inputSchema: z.object({ id: z.string().min(1) }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async ({ id }) => {
    const listing = catalog.listings.find((entry) => entry.id === id);
    return listing ? result(listing) : result({ error: `Unknown listing ID: ${id}` }, true);
  }
);

server.registerTool(
  "recommend_listings",
  {
    title: "Recommend publishing channels",
    description: "Recommend catalog entries for an app, site, library, AI tool, MCP server, or open-source project.",
    inputSchema: z.object({
      name: z.string().optional(),
      description: z.string().min(10),
      type: acceptsSchema.optional(),
      tags: z.array(z.string()).optional(),
      ai: z.boolean().optional(),
      open_source: z.boolean().optional(),
      commercial: z.boolean().optional(),
      platform: z.string().optional(),
      publish_via_mcp: z.boolean().optional(),
      minimum_listing_stars: z.number().int().nonnegative().optional(),
      limit: z.number().int().min(1).max(100).default(20)
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async (project) => result({ results: recommendListings(catalog.listings, project) })
);

server.registerTool(
  "validate_listing",
  {
    title: "Validate a listing proposal",
    description: "Validate and deduplicate a candidate without changing any files.",
    inputSchema: z.object(candidateSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async (candidate) => {
    const queue = await readJson("data/candidates.json");
    const validation = validateCandidate(candidate, catalog, queue);
    return result(validation, !validation.valid);
  }
);

server.registerTool(
  "propose_listing",
  {
    title: "Propose a listing for review",
    description: "Add a validated, deduplicated candidate to data/candidates.json for human review. Does not alter the curated catalog.",
    inputSchema: z.object(candidateSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (candidate) => {
    const proposal = await proposeCandidate(candidate, catalog);
    return result(proposal, !proposal.valid);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
