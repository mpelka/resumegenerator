#!/usr/bin/env bun
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { $ } from "bun";
import { program } from "commander";
import { chromium } from "playwright";
import { renderResume } from "./render.ts";
import {
  buildHtml,
  buildPdfName,
  deriveInitials,
  GOOGLE_FONTS_URL,
  parseFontFaces,
  parseFrontmatter,
} from "./utils.ts";

if (typeof Bun === "undefined") {
  console.error("This tool requires Bun. Install it at https://bun.sh");
  process.exit(1);
}

const ROOT = resolve(import.meta.dirname, "..");
const FONTS_DIR = resolve(ROOT, ".fonts");

async function ensureFont(fontFamily: string): Promise<string | null> {
  const url = GOOGLE_FONTS_URL[fontFamily];
  if (!url) return null;

  mkdirSync(FONTS_DIR, { recursive: true });

  // Return cached CSS if available
  const cacheFile = resolve(FONTS_DIR, `${fontFamily}.css`);
  if (existsSync(cacheFile)) {
    return readFileSync(cacheFile, "utf-8");
  }

  console.log(`Downloading fonts for ${fontFamily} (one-time)...`);

  // Fetch with basic UA to get un-subsetted TTF URLs (no unicode-range splitting)
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)" },
  });
  const cssText = await res.text();
  const faces = parseFontFaces(cssText, fontFamily);

  const cssRules: string[] = [];
  for (const face of faces) {
    const filePath = resolve(FONTS_DIR, face.filename);

    if (!existsSync(filePath)) {
      const fontRes = await fetch(face.fileUrl);
      writeFileSync(filePath, Buffer.from(await fontRes.arrayBuffer()));
    }

    cssRules.push(`@font-face {
      font-family: '${fontFamily}';
      src: url('${pathToFileURL(filePath).href}') format('truetype');
      font-weight: ${face.weight};
      font-style: ${face.style};
    }`);
  }

  const result = cssRules.join("\n");
  writeFileSync(cacheFile, result);
  return result;
}

async function ensureFonts(families: string[]): Promise<string | null> {
  const results: string[] = [];
  for (const family of families) {
    const css = await ensureFont(family);
    if (css) results.push(css);
  }
  return results.join("\n") || null;
}

program
  .description("Generate a styled PDF resume from markdown")
  .requiredOption("--filename <path>", "path to the markdown resume")
  .option("--template <name>", "template name", "modern")
  .option("--initials <letters>", "override auto-derived monogram initials")
  .option("--output-filename <name>", "override the output PDF filename")
  .option("--spacing <multiplier>", "scale vertical gaps (e.g. 0.8 = 80%)")
  .parse();

const opts = program.opts();
const filename = opts.filename;
const outputFilename = opts.outputFilename;

// Load template
const templateName = opts.template;
const templateDir = resolve(ROOT, "templates", templateName);

if (!existsSync(templateDir)) {
  const available = readdirSync(resolve(ROOT, "templates"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  console.error(`Template "${templateName}" not found. Available templates: ${available.join(", ")}`);
  process.exit(1);
}

const templateConfig = (await import(resolve(templateDir, "template.js"))).default;
const templateCSS = readFileSync(resolve(templateDir, "style.css"), "utf-8");
const baseCSS = readFileSync(resolve(ROOT, "src", "base.css"), "utf-8");

// Read and validate markdown
const mdPath = resolve(process.cwd(), filename);
const outputDir = dirname(mdPath);

let raw: string;
try {
  raw = readFileSync(mdPath, "utf-8");
} catch {
  console.error(`File not found: ${mdPath}`);
  process.exit(1);
}

const { markdown } = parseFrontmatter(raw);

const nameMatch = markdown.match(/^#\s+(.+)$/m);
if (!nameMatch) {
  console.error("Error: markdown must contain an h1 heading (# Name)");
  process.exit(1);
}

// Derive initials from h1 or use CLI override
const initials = opts.initials || deriveInitials(nameMatch[1]);

// Render markdown to HTML
const bodyHtml = renderResume(markdown, { initials, features: templateConfig.features });

// Download/cache fonts
const fontFamilies = Object.values(templateConfig.fonts) as string[];
const fontFaceCSS = await ensureFonts(fontFamilies);

// Build spacing overrides if provided (multiplier, e.g. 0.8 = 80% of default gaps)
let spacingCSS = "";
const spacing = opts.spacing ? parseFloat(opts.spacing) : null;
if (spacing != null) {
  const s = spacing;
  spacingCSS = [
    `header { margin-bottom: ${20 * s}px !important; }`,
    `.section-divider { margin-top: ${28 * s}px !important; margin-bottom: ${20 * s}px !important; }`,
    `h3 { margin-top: ${32 * s}px !important; }`,
    `ul { margin-top: ${6 * s}px !important; }`,
    `ul + p { margin-top: ${6 * s}px !important; }`,
  ].join("\n");
}

// Build CSS: base + template + spacing overrides
const css = `${baseCSS}\n${templateCSS}\n${spacingCSS}`;

let varsCSS = ":root {";
varsCSS += ` --font-primary: '${templateConfig.fonts.primary}', sans-serif;`;
if (templateConfig.fonts.secondary) {
  varsCSS += ` --font-secondary: '${templateConfig.fonts.secondary}', serif;`;
}
for (const [key, value] of Object.entries(templateConfig.colors) as [string, string][]) {
  const prop = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  varsCSS += ` --color-${prop}: ${value};`;
}
varsCSS += " }";

const pdfTitle = `${nameMatch[1]} - Resume`;
const fullHtml = buildHtml({ bodyHtml, fontFaceCSS, css, fontOverride: varsCSS, pdfTitle });

// Generate PDF with Playwright
const tmpHtml = resolve(outputDir, ".tmp-resume.html");
writeFileSync(tmpHtml, fullHtml);

const primaryFont = templateConfig.fonts.primary;
console.log(
  `Generating PDF (template: ${templateName}, font: ${primaryFont}, source: ${fontFaceCSS ? "Google Fonts (cached)" : "system fallback"})...`,
);
let browser: Awaited<ReturnType<typeof chromium.launch>>;
try {
  browser = await chromium.launch();
} catch {
  console.error("Chromium not found. Run: npx playwright install chromium");
  unlinkSync(tmpHtml);
  process.exit(1);
}
const page = await browser.newPage();
await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "networkidle" });
await page.evaluateHandle("document.fonts.ready");

const pdfName = buildPdfName(filename, outputFilename);
const pdfPath = resolve(outputDir, pdfName);

await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  tagged: true,
});

await browser.close();
unlinkSync(tmpHtml);

// Analyze page breaks from the actual PDF using pdftotext (optional)
const hasPdftotext = await $`which pdftotext`.quiet().nothrow().then((r) => r.exitCode === 0);

if (hasPdftotext) {
  const text = await $`pdftotext -layout ${pdfPath} -`.quiet().text();
  const pages = text.split("\f").filter((p) => p.trim());
  const pgLabel = pages.length === 1 ? "1 page" : `${pages.length} pages`;
  console.log(`PDF saved to: ${pdfPath} (${pgLabel})`);

  const truncate = (s: string) => (s.length > 80 ? `${s.slice(0, 77)}...` : s);

  for (let i = 0; i < pages.length - 1; i++) {
    const lines = pages[i].split("\n");
    const nextLines = pages[i + 1].split("\n");

    let lastLine = "";
    let trailingBlanks = 0;
    for (let j = lines.length - 1; j >= 0; j--) {
      if (!lines[j].trim()) {
        trailingBlanks++;
      } else {
        lastLine = lines[j].trim();
        break;
      }
    }

    let firstLine = "";
    for (const line of nextLines) {
      if (line.trim()) {
        firstLine = line.trim();
        break;
      }
    }

    const status = trailingBlanks > 15 ? "⚠️ " : "✅";
    const warn = trailingBlanks > 15 ? " — possible bad break (try adjusting --spacing)" : "";
    console.log(`${status} Page ${i + 1} break${warn}`);
    if (lastLine) console.log(`   Last before break:  "${truncate(lastLine)}"`);
    if (firstLine) console.log(`   First after break:  "${truncate(firstLine)}"`);
  }
} else {
  console.log(`PDF saved to: ${pdfPath}`);
  console.log("Tip: install pdftotext for page break analysis (brew install poppler)");
}
