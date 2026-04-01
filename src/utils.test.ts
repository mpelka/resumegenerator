import { describe, expect, test } from "bun:test";
import {
  analyzePageBreaks,
  buildHtml,
  buildPdfName,
  buildSpacingCSS,
  buildVarsCSS,
  deriveInitials,
  GOOGLE_FONTS_URL,
  parseFontFaces,
  parseFrontmatter,
} from "./utils.ts";

describe("deriveInitials", () => {
  test("derives initials from two-word name", () => {
    expect(deriveInitials("Jane Doe")).toBe("JD");
  });

  test("handles Unicode characters", () => {
    expect(deriveInitials("André François")).toBe("AF");
  });

  test("handles single-word name", () => {
    expect(deriveInitials("Madonna")).toBe("M");
  });

  test("handles three-word name", () => {
    expect(deriveInitials("John Paul Smith")).toBe("JPS");
  });
});

describe("parseFrontmatter", () => {
  test("parses frontmatter and returns meta + body", () => {
    const raw = `---
title: My Resume
company: Acme Corp
---
# Jane Doe

**Engineer**`;
    const { meta, markdown } = parseFrontmatter(raw);
    expect(meta.title).toBe("My Resume");
    expect(meta.company).toBe("Acme Corp");
    expect(markdown).toContain("# Jane Doe");
    expect(markdown).not.toContain("---");
  });

  test("returns empty meta when no frontmatter present", () => {
    const raw = "# Jane Doe\n\n**Engineer**";
    const { meta, markdown } = parseFrontmatter(raw);
    expect(meta).toEqual({});
    expect(markdown).toBe(raw);
  });

  test("handles frontmatter with various YAML types", () => {
    const raw = `---
title: Senior Engineer
date: 2025-01-15
tags:
  - engineering
  - frontend
priority: 3
---
# Content`;
    const { meta } = parseFrontmatter(raw);
    expect(meta.title).toBe("Senior Engineer");
    expect(meta.tags).toEqual(["engineering", "frontend"]);
    expect(meta.priority).toBe(3);
  });
});

describe("buildPdfName", () => {
  test("uses filename without .md extension", () => {
    expect(buildPdfName("resume.md")).toBe("resume.pdf");
  });

  test("returns outputFilename when provided", () => {
    expect(buildPdfName("resume.md", "custom.pdf")).toBe("custom.pdf");
  });

  test("handles multi-word filenames", () => {
    expect(buildPdfName("jane-doe.md")).toBe("jane-doe.pdf");
  });
});

describe("buildHtml", () => {
  const result = buildHtml({
    bodyHtml: "<p>Hello</p>",
    fontFaceCSS: "@font-face { }",
    css: "body { color: red; }",
    fontOverride: ":root { --font-primary: sans-serif; }",
    pdfTitle: "Test Resume",
  });

  test("contains doctype", () => {
    expect(result).toContain("<!DOCTYPE html>");
  });

  test("contains title", () => {
    expect(result).toContain("<title>Test Resume</title>");
  });

  test("contains font face CSS", () => {
    expect(result).toContain("@font-face { }");
  });

  test("contains body HTML", () => {
    expect(result).toContain("<p>Hello</p>");
  });

  test("handles null fontFaceCSS", () => {
    const html = buildHtml({
      bodyHtml: "<p>Hi</p>",
      fontFaceCSS: null,
      css: "",
      fontOverride: "",
      pdfTitle: "T",
    });
    expect(html).toContain("<style></style>");
    expect(html).not.toContain("null");
  });
});

describe("buildSpacingCSS", () => {
  test("generates correct CSS at default scale (1.0)", () => {
    const css = buildSpacingCSS(1);
    expect(css).toContain("header { margin-bottom: 20px !important; }");
    expect(css).toContain("h3 { margin-top: 32px !important; }");
    expect(css).toContain("ul { margin-top: 6px !important; }");
  });

  test("scales values by multiplier", () => {
    const css = buildSpacingCSS(0.5);
    expect(css).toContain("header { margin-bottom: 10px !important; }");
    expect(css).toContain("h3 { margin-top: 16px !important; }");
    expect(css).toContain("ul { margin-top: 3px !important; }");
  });

  test("handles zero multiplier", () => {
    const css = buildSpacingCSS(0);
    expect(css).toContain("margin-bottom: 0px");
    expect(css).toContain("margin-top: 0px");
  });

  test("includes section-divider and ul+p rules", () => {
    const css = buildSpacingCSS(1);
    expect(css).toContain(".section-divider { margin-top: 28px !important; margin-bottom: 20px !important; }");
    expect(css).toContain("ul + p { margin-top: 6px !important; }");
  });
});

describe("buildVarsCSS", () => {
  test("sets primary font", () => {
    const css = buildVarsCSS({ primary: "Inter" }, {});
    expect(css).toBe(":root { --font-primary: 'Inter', sans-serif; }");
  });

  test("sets secondary font when provided", () => {
    const css = buildVarsCSS({ primary: "Inter", secondary: "Georgia" }, {});
    expect(css).toContain("--font-primary: 'Inter', sans-serif;");
    expect(css).toContain("--font-secondary: 'Georgia', serif;");
  });

  test("omits secondary font when not provided", () => {
    const css = buildVarsCSS({ primary: "Inter" }, {});
    expect(css).not.toContain("--font-secondary");
  });

  test("converts camelCase color keys to kebab-case", () => {
    const css = buildVarsCSS({ primary: "Inter" }, { accentColor: "#ff0000", textPrimary: "#333" });
    expect(css).toContain("--color-accent-color: #ff0000;");
    expect(css).toContain("--color-text-primary: #333;");
  });

  test("handles lowercase color keys unchanged", () => {
    const css = buildVarsCSS({ primary: "Inter" }, { accent: "#ff0000" });
    expect(css).toContain("--color-accent: #ff0000;");
  });
});

describe("analyzePageBreaks", () => {
  test("returns single page with no breaks", () => {
    const result = analyzePageBreaks("Just one page of content\n");
    expect(result.totalPages).toBe(1);
    expect(result.breaks).toHaveLength(0);
  });

  test("detects page break with last and first lines", () => {
    const text = "Line 1\nLine 2\nLast line on page 1\n\f\nFirst line on page 2\nMore content\n";
    const result = analyzePageBreaks(text);
    expect(result.totalPages).toBe(2);
    expect(result.breaks).toHaveLength(1);
    expect(result.breaks[0].lastLine).toBe("Last line on page 1");
    expect(result.breaks[0].firstLine).toBe("First line on page 2");
    expect(result.breaks[0].page).toBe(1);
  });

  test("marks break as ok when few trailing blanks", () => {
    const text = "Content\nLast line\n\n\n\f\nNext page\n";
    const result = analyzePageBreaks(text);
    expect(result.breaks[0].ok).toBe(true);
    expect(result.breaks[0].trailingBlanks).toBe(3);
  });

  test("marks break as bad when many trailing blanks", () => {
    const blanks = "\n".repeat(20);
    const text = `Content\nLast line${blanks}\f\nNext page\n`;
    const result = analyzePageBreaks(text);
    expect(result.breaks[0].ok).toBe(false);
    expect(result.breaks[0].trailingBlanks).toBe(20);
  });

  test("threshold is 15 trailing blanks", () => {
    const exactly15 = "\n".repeat(15);
    const result15 = analyzePageBreaks(`Content${exactly15}\f\nPage 2\n`);
    expect(result15.breaks[0].ok).toBe(true);

    const sixteen = "\n".repeat(16);
    const result16 = analyzePageBreaks(`Content${sixteen}\f\nPage 2\n`);
    expect(result16.breaks[0].ok).toBe(false);
  });

  test("handles multiple page breaks", () => {
    const text = "Page 1 content\n\f\nPage 2 content\n\f\nPage 3 content\n";
    const result = analyzePageBreaks(text);
    expect(result.totalPages).toBe(3);
    expect(result.breaks).toHaveLength(2);
    expect(result.breaks[0].page).toBe(1);
    expect(result.breaks[0].firstLine).toBe("Page 2 content");
    expect(result.breaks[1].page).toBe(2);
    expect(result.breaks[1].lastLine).toBe("Page 2 content");
    expect(result.breaks[1].firstLine).toBe("Page 3 content");
  });

  test("handles empty pages gracefully", () => {
    const text = "Content\n\f\n   \n\f\nPage 3\n";
    const result = analyzePageBreaks(text);
    // Middle page is whitespace-only, gets filtered out
    expect(result.totalPages).toBe(2);
  });

  test("trims whitespace from extracted lines", () => {
    const text = "   Indented last line   \n\f\n   Indented first line   \n";
    const result = analyzePageBreaks(text);
    expect(result.breaks[0].lastLine).toBe("Indented last line");
    expect(result.breaks[0].firstLine).toBe("Indented first line");
  });
});

describe("GOOGLE_FONTS_URL", () => {
  test("has entries for known fonts", () => {
    expect(GOOGLE_FONTS_URL["IBM Plex Sans"]).toBeDefined();
    expect(GOOGLE_FONTS_URL["Fira Sans"]).toBeDefined();
    expect(GOOGLE_FONTS_URL.Inter).toBeDefined();
    expect(GOOGLE_FONTS_URL.Lato).toBeDefined();
    expect(GOOGLE_FONTS_URL["DM Sans"]).toBeDefined();
  });

  test("URLs point to Google Fonts", () => {
    for (const url of Object.values(GOOGLE_FONTS_URL)) {
      expect(url).toMatch(/^https:\/\/fonts\.googleapis\.com/);
    }
  });
});

describe("parseFontFaces", () => {
  const sampleCSS = `
@font-face {
  font-family: 'Test Font';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/test/regular.ttf) format('truetype');
}
@font-face {
  font-family: 'Test Font';
  font-style: italic;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/test/bold-italic.ttf) format('truetype');
}`;

  test("parses correct number of faces", () => {
    const faces = parseFontFaces(sampleCSS, "Test Font");
    expect(faces).toHaveLength(2);
  });

  test("extracts font URL", () => {
    const faces = parseFontFaces(sampleCSS, "Test Font");
    expect(faces[0].fileUrl).toBe("https://fonts.gstatic.com/s/test/regular.ttf");
    expect(faces[1].fileUrl).toBe("https://fonts.gstatic.com/s/test/bold-italic.ttf");
  });

  test("extracts weight and style", () => {
    const faces = parseFontFaces(sampleCSS, "Test Font");
    expect(faces[0].weight).toBe("400");
    expect(faces[0].style).toBe("normal");
    expect(faces[1].weight).toBe("700");
    expect(faces[1].style).toBe("italic");
  });

  test("builds filename from family, weight, and style", () => {
    const faces = parseFontFaces(sampleCSS, "Test Font");
    expect(faces[0].filename).toBe("Test Font-400-normal.ttf");
    expect(faces[1].filename).toBe("Test Font-700-italic.ttf");
  });

  test("defaults to weight 400 and style normal when missing", () => {
    const css = `@font-face { src: url(https://example.com/font.ttf); }`;
    const faces = parseFontFaces(css, "Minimal");
    expect(faces[0].weight).toBe("400");
    expect(faces[0].style).toBe("normal");
  });

  test("skips faces without url", () => {
    const css = `@font-face { font-weight: 400; font-style: normal; }`;
    const faces = parseFontFaces(css, "No URL");
    expect(faces).toHaveLength(0);
  });

  test("returns empty array for non-font CSS", () => {
    const faces = parseFontFaces("body { color: red; }", "Whatever");
    expect(faces).toHaveLength(0);
  });
});
