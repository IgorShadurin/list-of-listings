#!/usr/bin/env node

import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import { ROOT } from "./lib/common.mjs";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(ROOT, "mcp/server.mjs")],
  cwd: ROOT,
  stderr: "pipe"
});
const client = new Client({ name: "list-of-listings-test", version: "1.0.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, ["get_listing", "propose_listing", "recommend_listings", "search_listings", "validate_listing"]);

  const search = await client.callTool({
    name: "search_listings",
    arguments: { accepts: ["mcp-server"], limit: 3 }
  });
  assert.notEqual(search.isError, true);
  const searchPayload = JSON.parse(search.content[0].text);
  assert.equal(searchPayload.results.length, 3);

  const recommendation = await client.callTool({
    name: "recommend_listings",
    arguments: {
      description: "A commercial AI developer tool delivered as a web application.",
      type: "ai-tool",
      commercial: true,
      limit: 5
    }
  });
  assert.notEqual(recommendation.isError, true);
  const recommendationPayload = JSON.parse(recommendation.content[0].text);
  assert.equal(recommendationPayload.results.length, 5);

  const validation = await client.callTool({
    name: "validate_listing",
    arguments: {
      name: "Example Test Directory",
      description: "A non-persisted candidate used to test MCP validation behavior.",
      url: "https://example.invalid/listings",
      submission_url: "https://example.invalid/submit",
      accepts: ["app"],
      evidence_urls: ["https://example.invalid/rules"]
    }
  });
  assert.notEqual(validation.isError, true);
  const validationPayload = JSON.parse(validation.content[0].text);
  assert.equal(validationPayload.valid, true);

  console.log(`MCP smoke test passed with ${names.length} tools and searchable catalog data.`);
} finally {
  await client.close();
}
