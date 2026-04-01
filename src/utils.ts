import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function parseFrontmatter(raw: string): { meta: Record<string, unknown>; markdown: string } {
  const match = raw.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, markdown: raw };
  return { meta: Bun.YAML.parse(match[1]) as Record<string, unknown>, markdown: match[2] };
}

export const GOOGLE_FONTS_URL: Record<string, string> = {
  "Source Sans 3":
    "https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&display=swap",
  "IBM Plex Sans":
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&display=swap",
  "Fira Sans":
    "https://fonts.googleapis.com/css2?family=Fira+Sans:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&display=swap",
  Lato: "https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,300;0,400;0,700;1,300;1,400&display=swap",
  Inter: "https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&display=swap",
  "DM Sans":
    "https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&display=swap",
  "IBM Plex Mono":
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&display=swap",
};

export function buildPdfName(filename: string, outputFilename?: string): string {
  if (outputFilename) return outputFilename;
  return `${basename(filename, ".md")}.pdf`;
}

interface BuildHtmlOptions {
  bodyHtml: string;
  fontFaceCSS: string | null;
  css: string;
  fontOverride: string;
  pdfTitle: string;
}

export function buildHtml({ bodyHtml, fontFaceCSS, css, fontOverride, pdfTitle }: BuildHtmlOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${pdfTitle}</title>
  <style>${fontFaceCSS ?? ""}</style>
  <style>${css}</style>
  <style>${fontOverride}</style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

export interface FontFace {
  fileUrl: string;
  weight: string;
  style: string;
  filename: string;
}

export function buildSpacingCSS(spacing: number): string {
  const s = spacing;
  return [
    `header { margin-bottom: ${20 * s}px !important; }`,
    `.section-divider { margin-top: ${28 * s}px !important; margin-bottom: ${20 * s}px !important; }`,
    `h3 { margin-top: ${32 * s}px !important; }`,
    `ul { margin-top: ${6 * s}px !important; }`,
    `ul + p { margin-top: ${6 * s}px !important; }`,
  ].join("\n");
}

export function buildVarsCSS(fonts: { primary: string; secondary?: string }, colors: Record<string, string>): string {
  let css = ":root {";
  css += ` --font-primary: '${fonts.primary}', sans-serif;`;
  if (fonts.secondary) {
    css += ` --font-secondary: '${fonts.secondary}', serif;`;
  }
  for (const [key, value] of Object.entries(colors)) {
    const prop = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    css += ` --color-${prop}: ${value};`;
  }
  css += " }";
  return css;
}

export interface PageBreak {
  page: number;
  lastLine: string;
  firstLine: string;
  trailingBlanks: number;
  ok: boolean;
}

export function analyzePageBreaks(pdfText: string): { totalPages: number; breaks: PageBreak[] } {
  const pages = pdfText.split("\f").filter((p) => p.trim());
  const breaks: PageBreak[] = [];

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

    breaks.push({
      page: i + 1,
      lastLine,
      firstLine,
      trailingBlanks,
      ok: trailingBlanks <= 15,
    });
  }

  return { totalPages: pages.length, breaks };
}

export function parseFontFaces(cssText: string, fontFamily: string): FontFace[] {
  const faces: FontFace[] = [];
  const faceRegex = /@font-face\s*\{([^}]+)\}/g;

  for (const match of cssText.matchAll(faceRegex)) {
    const block = match[1];
    const urlMatch = block.match(/url\(([^)]+)\)/);
    const weightMatch = block.match(/font-weight:\s*(\d+)/);
    const styleMatch = block.match(/font-style:\s*(\w+)/);

    if (!urlMatch) continue;

    faces.push({
      fileUrl: urlMatch[1],
      weight: weightMatch?.[1] || "400",
      style: styleMatch?.[1] || "normal",
      filename: `${fontFamily}-${weightMatch?.[1] || "400"}-${styleMatch?.[1] || "normal"}.ttf`,
    });
  }

  return faces;
}

export async function ensureFont(fontFamily: string, fontsDir: string): Promise<string | null> {
  const url = GOOGLE_FONTS_URL[fontFamily];
  if (!url) return null;

  mkdirSync(fontsDir, { recursive: true });

  // Check if TTFs are already cached (any file matching this family)
  const firstFile = resolve(fontsDir, `${fontFamily}-400-normal.ttf`);
  if (!existsSync(firstFile)) {
    console.log(`Downloading fonts for ${fontFamily} (one-time)...`);

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)" },
    });
    const cssText = await res.text();
    const faces = parseFontFaces(cssText, fontFamily);

    for (const face of faces) {
      const filePath = resolve(fontsDir, face.filename);
      if (!existsSync(filePath)) {
        const fontRes = await fetch(face.fileUrl);
        writeFileSync(filePath, Buffer.from(await fontRes.arrayBuffer()));
      }
    }
  }

  // Always generate @font-face CSS at runtime from TTFs on disk (never cache
  // the CSS — it contains absolute file:// URLs that break if the cache moves)
  const faces = readdirSync(fontsDir)
    .filter((f) => f.startsWith(`${fontFamily}-`) && f.endsWith(".ttf"))
    .map((f) => {
      const match = f.match(/^.+-(\d+)-(normal|italic)\.ttf$/);
      if (!match) return null;
      return { filename: f, weight: match[1], style: match[2] };
    })
    .filter(Boolean) as { filename: string; weight: string; style: string }[];

  return faces
    .map(
      (face) => `@font-face {
      font-family: '${fontFamily}';
      src: url('${pathToFileURL(resolve(fontsDir, face.filename)).href}') format('truetype');
      font-weight: ${face.weight};
      font-style: ${face.style};
    }`,
    )
    .join("\n");
}

export async function ensureFonts(families: string[], fontsDir: string): Promise<string | null> {
  const results: string[] = [];
  for (const family of families) {
    const css = await ensureFont(family, fontsDir);
    if (css) results.push(css);
  }
  return results.join("\n") || null;
}
