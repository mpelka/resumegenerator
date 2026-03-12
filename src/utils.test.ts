import { describe, expect, test } from "bun:test";
import {
  buildHtml,
  buildPdfName,
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
