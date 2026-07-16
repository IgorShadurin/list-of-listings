# Contributing

Thanks for improving List of Listings. The catalog is useful only when each row points to a real place where a creator can publish, submit, launch, or promote a project.

## What belongs here

A listing should have:

- a live, canonical HTTP(S) URL;
- an actionable submission route such as a form, dashboard, package push, API, CLI, MCP tool, GitHub issue, or pull request;
- a factual description of what it accepts;
- primary evidence for claimed rules, prices, thresholds, review times, or automation support;
- a clear artifact type: app, website, library, AI tool, MCP server, plugin, API, dataset/model, open-source project, or curated list.

Do not add backlink resellers, bulk-submission agencies, parked domains, scraped pages with no real publishing mechanism, vote-trading services, or a directory merely because it contains outbound links.

## Generated files

`data/listings.json` and `README.md` are generated. Do not edit them directly.

- Manually researched, primary-source entries live in `data/manual-listings.json`.
- Primary-source-verified launch sites, registries, stores, and marketplaces live in `data/verified-web-listings.json`.
- Pending MCP proposals live in `data/candidates.json` until reviewed.
- Confirmed HTTP 404/410 rows live in `data/exclusions.json`; update them from a reviewed link report with `npm run links:record-exclusions`.
- GitHub and external-source snapshots live in `data/sources/` and are refreshed with `npm run refresh`.
- GitHub discovery queries live in `config/github-sources.json`.

After changing source data or generation code, run:

```bash
npm install
npm run build
npm test
```

Use `npm run check:links` when adding or changing URLs.

## Propose through MCP

The local MCP server exposes `validate_listing` and `propose_listing`. A proposal is deliberately written to the review queue rather than inserted into the curated catalog.

```bash
npm install
npm run mcp
```

Every MCP proposal must include a name, a description of at least 20 characters, a canonical URL, an actionable submission URL, and one or more accepted artifact types. Add `evidence_urls` whenever you claim eligibility rules or native automation.

## Pull request checklist

- [ ] The venue has a real publication or submission mechanism.
- [ ] The canonical URL and submission URL are not already present.
- [ ] The description is factual and concise.
- [ ] Unknown values are `null`; they are not guessed as `0` or `false`.
- [ ] Star thresholds, project-age rules, fees, queues, and review claims cite a direct rules page.
- [ ] MCP support is classified accurately: native write, general API write, workflow, CLI/API only, GitHub-MCP-assisted, manual only, or discovery only.
- [ ] Dynamic pricing includes a check date and avoids unsupported promises.
- [ ] `npm run build` and `npm test` pass.

## Automation ethics

This repository helps people find suitable channels. It does not authorize unsolicited mass submission, spam, fake engagement, CAPTCHA bypass, vote solicitation, or evasion of a venue's rules. Automation should stop before any action that requires human review, payment, credentials, or a policy judgment unless the operator explicitly authorizes it.
