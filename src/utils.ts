import { basename } from "node:path";

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
