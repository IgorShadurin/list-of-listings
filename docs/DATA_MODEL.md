# Data model

`data/listings.json` is the canonical machine-readable catalog. `README.md` is generated from it.

## Root object

| Field | Meaning |
|---|---|
| `$schema` | Relative path to the JSON Schema. |
| `schema_version` | Semantic version of this data contract. |
| `generated_at` | Timestamp of the newest source snapshot used in the build. |
| `catalog_date` | Human-friendly snapshot date. |
| `stats` | Generated aggregate counts; never edit by hand. |
| `sources` | Query and third-party source provenance. |
| `methodology` | Inclusion and uncertainty notes. |
| `listings` | Deduplicated listing records. |

## Listing identity and scope

`id` is stable within this project and prefixed by origin (`github-`, `web-`, `mcp-`). `url` is canonicalized and unique. `platform` describes where the listing lives, while `publication_scope` describes what the venue publishes: a directory entry, source repository, deployed app, hosted artifact, container repository, or registry metadata.

`accepts` is a machine-filterable array. Current values are:

```text
ai-tool, api, app, curated-list, dataset-or-model, library,
mcp-server, open-source-project, plugin, project, website
```

An `open-source-project` value means the venue is relevant to open-source projects; it does not by itself prove that open source is mandatory. Hard requirements live in `requirements`.

## Submission and requirements

`submission.url` is the best known actionable route. `submission.guidelines_url` points to separate rules when available. `submission.status` and `verification.status` deliberately remain separate: a channel can appear active while its precise eligibility evidence is still weak.

Hard thresholds use numbers or `null`:

- `requirements.minimum_stars`
- `requirements.minimum_project_age_days`
- `requirements.open_source_required`

`null` means unknown or unstated. It never means zero, optional, or false.

`requirements.rules_summary` contains short paraphrases. The source contribution document or primary evidence stays linked; full third-party policy text is not copied into the dataset.

GitHub topic matches are not included blindly. The build requires list-like semantics, text indicating that project artifacts are in scope, and either a detected contribution file or merged pull-request activity. Known meta-lists are retained because they can publish this catalog itself.

## GitHub metadata

GitHub rows include repository stars, forks, creation/update/push timestamps, default branch, SPDX license, primary language, topics, merged/open pull-request counts, and the latest merged-PR timestamp. These are discovery and activity signals, not proof that a maintainer will accept a specific project.

Repository creation date, first public release, and a venue's minimum project-age requirement are distinct facts. Only the first and third are currently modeled when known.

## MCP write levels

| Value | Meaning |
|---|---|
| `native_write` | A dedicated MCP tool directly publishes, submits, creates, or deploys. |
| `native_write_general_api` | MCP writes through a broad API executor rather than a dedicated publishing tool. |
| `mcp_workflow` | MCP guides or invokes a companion CLI workflow. |
| `indirect_via_github_mcp` | The venue takes a GitHub issue/PR that a generic GitHub MCP server can prepare. |
| `api_cli_only` | Machine-publishable through an API or CLI, but not a verified MCP write tool. |
| `manual_only` | A form, dashboard, or editorial workflow with no supported machine submission. |
| `discovery_only` | MCP can search or inspect the catalog but not submit to it. |

`automation.machine_submittable` records technical capability, not permission to submit without review.

## Verification statuses

| Status family | Meaning |
|---|---|
| `verified*` | Manually checked against linked primary documentation; suffixes such as `beta` or `partial` narrow the claim. |
| `strong-signal` | Automated GitHub evidence found both contribution guidance and merged-PR activity. |
| `probable` | At least one useful contribution signal exists. |
| `discovery-only` | Topic discovery only; confirm the submission path first. |
| `source-claimed` | An attributed source dataset claims the web channel accepts listings; the row was not individually reverified here. |

## Candidate queue

`data/candidates.json` is intentionally a separate review queue. The MCP `propose_listing` tool writes only there. A candidate becomes curated only after evidence review and a normal generated-data build.
