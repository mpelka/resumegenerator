#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { $ } from "bun";
import { program } from "commander";
import { chromium } from "playwright";
import { renderResume } from "./render.ts";
import {
  analyzePageBreaks,
  buildHtml,
  buildPdfName,
  buildSpacingCSS,
  buildVarsCSS,
  deriveInitials,
  ensureFonts,
  parseFrontmatter,
} from "./utils.ts";

function reportError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
}

if (typeof Bun === "undefined") {
  reportError("This tool requires Bun. Install it at https://bun.sh");
  process.exit(1);
}

const ROOT = resolve(import.meta.dirname, "..");
const FONTS_DIR = resolve(
  process.env.XDG_CACHE_HOME || resolve(require("node:os").homedir(), ".cache"),
  "resumegenerator",
  "fonts",
);

interface TemplateConfig {
  fonts: { primary: string; secondary?: string };
  colors: Record<string, string>;
  features: Record<string, boolean>;
}

function loadTemplate(templateName: string): { config: TemplateConfig; css: string; baseCSS: string } {
  const templateDir = resolve(ROOT, "templates", templateName);

  if (!existsSync(templateDir)) {
    const available = readdirSync(resolve(ROOT, "templates"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    reportError(`Template "${templateName}" not found. Available templates: ${available.join(", ")}`);
    process.exit(1);
  }

  const config = require(resolve(templateDir, "template.js")).default;
  const css = readFileSync(resolve(templateDir, "style.css"), "utf-8");
  const baseCSS = readFileSync(resolve(ROOT, "src", "base.css"), "utf-8");

  return { config, css, baseCSS };
}

function loadMarkdown(filename: string): { markdown: string; name: string; outputDir: string } {
  const mdPath = resolve(process.cwd(), filename);

  let raw: string;
  try {
    raw = readFileSync(mdPath, "utf-8");
  } catch {
    reportError(`File not found: ${mdPath}`);
    process.exit(1);
  }

  const { markdown } = parseFrontmatter(raw);
  const nameMatch = markdown.match(/^#\s+(.+)$/m);
  if (!nameMatch) {
    reportError("Error: markdown must contain an h1 heading (# Name)");
    process.exit(1);
  }

  return { markdown, name: nameMatch[1], outputDir: dirname(mdPath) };
}

async function generatePdf(htmlContent: string, outputDir: string, pdfPath: string): Promise<void> {
  const tmpHtml = resolve(outputDir, ".tmp-resume.html");
  writeFileSync(tmpHtml, htmlContent);

  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    browser = await chromium.launch();
  } catch {
    reportError("Chromium not found. Run: npx playwright install chromium");
    unlinkSync(tmpHtml);
    process.exit(1);
  }

  const page = await browser.newPage();
  await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "networkidle" });
  await page.evaluateHandle("document.fonts.ready");

  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    tagged: true,
  });

  await browser.close();
  unlinkSync(tmpHtml);
}

async function printPageBreakAnalysis(pdfPath: string): Promise<void> {
  const hasPdftotext = await $`which pdftotext`
    .quiet()
    .nothrow()
    .then((r) => r.exitCode === 0);

  const log = (line: string) => process.stderr.write(`${line}\n`);

  if (hasPdftotext) {
    const text = await $`pdftotext -layout ${pdfPath} -`.quiet().text();
    const { totalPages, breaks } = analyzePageBreaks(text);
    const pgLabel = totalPages === 1 ? "1 page" : `${totalPages} pages`;
    log(`PDF saved to: ${pdfPath} (${pgLabel})`);

    const truncate = (s: string) => (s.length > 80 ? `${s.slice(0, 77)}...` : s);

    for (const b of breaks) {
      const status = b.ok ? "✅" : "⚠️ ";
      const warn = b.ok ? "" : " — possible bad break (try adjusting --spacing)";
      log(`${status} Page ${b.page} break${warn}`);
      if (b.lastLine) log(`   Last before break:  "${truncate(b.lastLine)}"`);
      if (b.firstLine) log(`   First after break:  "${truncate(b.firstLine)}"`);
    }
  } else {
    log(`PDF saved to: ${pdfPath}`);
    log("Tip: install pdftotext for page break analysis (brew install poppler)");
  }
}

// --- CLI entry point ---

program
  .description("Generate a styled PDF resume from markdown")
  .requiredOption("--filename <path>", "path to the markdown resume")
  .option("--template <name>", "template name", "modern")
  .option("--initials <letters>", "override auto-derived monogram initials")
  .option("--output-filename <name>", "override the output PDF filename")
  .option("--spacing <multiplier>", "scale vertical gaps (e.g. 0.8 = 80%)")
  .action(async (opts) => {
    const { config: templateConfig, css: templateCSS, baseCSS } = loadTemplate(opts.template);
    const { markdown, name, outputDir } = loadMarkdown(opts.filename);

    const initials = opts.initials || deriveInitials(name);
    const bodyHtml = renderResume(markdown, { initials, features: templateConfig.features });

    const fontFamilies = Object.values(templateConfig.fonts) as string[];
    const fontFaceCSS = await ensureFonts(fontFamilies, FONTS_DIR);

    const spacing = opts.spacing ? parseFloat(opts.spacing) : null;
    const spacingCSS = spacing != null ? buildSpacingCSS(spacing) : "";
    const css = `${baseCSS}\n${templateCSS}\n${spacingCSS}`;
    const varsCSS = buildVarsCSS(templateConfig.fonts, templateConfig.colors);

    const fullHtml = buildHtml({ bodyHtml, fontFaceCSS, css, fontOverride: varsCSS, pdfTitle: `${name} - Resume` });

    const pdfName = buildPdfName(opts.filename, opts.outputFilename);
    const pdfPath = resolve(outputDir, pdfName);

    console.log(
      `Generating PDF (template: ${opts.template}, font: ${templateConfig.fonts.primary}, source: ${fontFaceCSS ? "Google Fonts (cached)" : "system fallback"})...`,
    );

    await generatePdf(fullHtml, outputDir, pdfPath);
    await printPageBreakAnalysis(pdfPath);
  });

program.parseAsync().catch((err) => {
  reportError(err);
  process.exit(1);
});
