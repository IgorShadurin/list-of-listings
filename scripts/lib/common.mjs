import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

export async function writeJson(path, value) {
  const target = resolve(ROOT, path);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, target);
}

export function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function compact(values) {
  return [...new Set(values.filter(Boolean))];
}

export function cleanText(value, fallback = "No description supplied.") {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text || fallback;
}

export function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return String(value ?? "").trim();
  }
}

export function categoryFromText(input) {
  const text = String(input).toLowerCase();
  const rules = [
    ["MCP & Agent Publishing", /\b(mcp|model context protocol|agentic|ai agent)\b/],
    ["AI & Machine Learning", /\b(ai|artificial intelligence|machine learning|deep learning|llm|neural|computer vision|nlp|generative)\b/],
    ["Security & Privacy", /\b(security|privacy|cyber|hacking|pentest|malware|cryptograph|forensic|vulnerability)\b/],
    ["DevOps, Cloud & Infrastructure", /\b(devops|cloud|kubernetes|docker|container|infrastructure|sre|serverless|hosting|deployment|sysadmin|observability)\b/],
    ["Data, Databases & APIs", /\b(database|data science|analytics|dataset|sql|nosql|api|graphql|data engineering|big data)\b/],
    ["Mobile & Desktop", /\b(ios|android|mobile|macos|windows|linux desktop|desktop app|flutter|react native|swiftui)\b/],
    ["Web Development", /\b(web development|frontend|front-end|backend|back-end|javascript|typescript|react|vue|angular|css|html|browser|webapp|web app)\b/],
    ["Languages & Frameworks", /\b(python|golang|\bgo\b|rust|ruby|java\b|kotlin|php|c\+\+|\.net|framework|programming language|node\.js|nodejs)\b/],
    ["Open Source & Self-hosted", /\b(open[ -]?source|foss|self[ -]?hosted|free software|indie)\b/],
    ["Developer Tools", /\b(developer|development|programming|coding|cli|terminal|editor|ide|sdk|library|libraries|package|plugin|extension|github|git)\b/],
    ["Design & Creative", /\b(design|ui|ux|creative|graphics|font|color|animation|audio|video|photography|art)\b/],
    ["Games", /\b(game|gaming|gamedev|unity|unreal)\b/],
    ["Blockchain & Web3", /\b(blockchain|web3|crypto|ethereum|bitcoin|solana)\b/],
    ["Science & Education", /\b(science|research|education|learning|course|academic|biology|physics|chemistry|health|medical)\b/],
    ["Business & Productivity", /\b(business|startup|saas|marketing|productivity|finance|sales|ecommerce|e-commerce|entrepreneur)\b/]
  ];
  return rules.find(([, expression]) => expression.test(text))?.[0] ?? "General Project Discovery";
}

export function inferAccepts(input) {
  const text = String(input).toLowerCase();
  const accepts = [];
  if (/\b(ai|artificial intelligence|machine learning|llm|agentic|ai agent)\b/.test(text)) accepts.push("ai-tool");
  if (/\b(librar(?:y|ies)|package|sdk|framework|module|component)\b/.test(text)) accepts.push("library");
  if (/\b(app|application|software|tool|cli|desktop|mobile|saas|product)\b/.test(text)) accepts.push("app");
  if (/\b(web ?site|web ?app|site|landing page|web project)\b/.test(text)) accepts.push("website");
  if (/\b(api|graphql|webhook)\b/.test(text)) accepts.push("api");
  if (/\b(dataset|data set|model|benchmark)\b/.test(text)) accepts.push("dataset-or-model");
  if (/\b(plugin|extension|integration|addon|add-on)\b/.test(text)) accepts.push("plugin");
  if (/\b(mcp|model context protocol)\b/.test(text)) accepts.push("mcp-server");
  if (/\b(open[ -]?source|foss|self[ -]?hosted)\b/.test(text)) accepts.push("open-source-project");
  return compact(accepts.length ? accepts : ["project"]);
}

export function detectRules(text) {
  const source = cleanText(text, "");
  const lower = source.toLowerCase();
  let minimumStars = null;
  let minimumProjectAgeDays = null;

  const starPatterns = [
    /(?:must|should|needs? to|require(?:s|d)?|at least|minimum(?: of)?)\D{0,35}(\d[\d,]*)\+?\s+(?:github\s+)?stars?/i,
    /(\d[\d,]*)\+?\s+(?:github\s+)?stars?\D{0,35}(?:minimum|required|at least)/i
  ];
  for (const pattern of starPatterns) {
    const match = source.match(pattern);
    if (match) {
      minimumStars = Number(match[1].replaceAll(",", ""));
      break;
    }
  }

  const ageMatch = source.match(/(?:at least|minimum(?: of)?|must be)\s+(\d+)\s*(day|week|month|year)s?\s+(?:old|of age|since (?:launch|creation))/i);
  if (ageMatch) {
    const multiplier = { day: 1, week: 7, month: 30, year: 365 }[ageMatch[2].toLowerCase()];
    minimumProjectAgeDays = Number(ageMatch[1]) * multiplier;
  }

  const requirements = [];
  if (/alphabetic(?:al|ally)|alphabetized|alphabetised/.test(lower)) requirements.push("Keep entries in alphabetical order.");
  if (/description/.test(lower) && /(?:short|concise|brief|one[- ]line)/.test(lower)) requirements.push("Include a concise description.");
  if (/one (?:item|project|link|addition) per (?:pull request|pr)/.test(lower)) requirements.push("Submit one addition per pull request.");
  if (/add (?:your|the) (?:item|project|link|entry).{0,40}(?:bottom|end) of/.test(lower)) requirements.push("Add the entry at the end of the relevant section.");
  if (/https/.test(lower) && /(?:prefer|must|require)/.test(lower)) requirements.push("Use an HTTPS project URL when available.");
  if (/no self[- ]promotion|self[- ]promotion (?:is )?(?:not allowed|prohibited)/.test(lower)) requirements.push("Self-promotion is not accepted.");
  if (/open[ -]?source/.test(lower) && /(?:must|only|required)/.test(lower)) requirements.push("Project must be open source.");
  if (/license/.test(lower) && /(?:must|required|include)/.test(lower)) requirements.push("Include a visible software license.");
  if (/tests?/.test(lower) && /(?:must|run|pass|required)/.test(lower)) requirements.push("Run or pass the requested checks.");
  if (/why.{0,20}(?:awesome|useful|valuable)|explain.{0,30}(?:awesome|useful|valuable)/.test(lower)) requirements.push("Explain why the project belongs on the list.");

  return {
    minimum_stars: Number.isFinite(minimumStars) ? minimumStars : null,
    minimum_project_age_days: Number.isFinite(minimumProjectAgeDays) ? minimumProjectAgeDays : null,
    open_source_required: requirements.includes("Project must be open source.") ? true : null,
    rules_summary: compact(requirements).slice(0, 5)
  };
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

export function markdownEscape(value) {
  return cleanText(value).replaceAll("|", "\\|").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function daysSince(isoDate, referenceDate) {
  if (!isoDate) return null;
  return Math.max(0, Math.floor((new Date(referenceDate) - new Date(isoDate)) / 86_400_000));
}
