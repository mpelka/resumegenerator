import { describe, expect, test } from "bun:test";
import { renderResume } from "./render.ts";
import { buildHtml, parseFrontmatter } from "./utils.ts";

const FIXTURE = `# Jane Doe

**Senior Software Engineer**

Warsaw, Poland • jane@example.com • linkedin.com/in/jane

Experienced engineer specializing in **frontend architecture** and type-safe development.

## Work Experience

### Acme Corp
**Lead Developer** | Jan 2020 - Present

* Built a configurable platform from scratch.
* Led migration from JavaScript to **TypeScript**.

*Technologies used: React, TypeScript, Next.js.*

### Startup Inc
**Frontend Developer** | Mar 2016 - Dec 2019

* Developed multiple client-facing applications.

## Education

### University of Testing
**BSc Computer Science** | 2012 - 2016

## Skills

- **Core:** TypeScript • React • Next.js
- **Tools:** Git • Figma
`;

const FIXTURE_WITH_FRONTMATTER = `---
title: Senior Engineer Resume
company: Acme Corp
tags:
  - engineering
  - frontend
---
# Jane Doe

**Senior Software Engineer**

Warsaw, Poland • jane@example.com

## Work Experience

### Acme Corp
**Lead Developer** | Jan 2020 - Present

* Built a configurable platform from scratch.
`;

describe("frontmatter stripping", () => {
  test("frontmatter is stripped and not present in rendered HTML", () => {
    const { markdown } = parseFrontmatter(FIXTURE_WITH_FRONTMATTER);
    const bodyHtml = renderResume(markdown);
    expect(bodyHtml).toContain("Jane Doe");
    expect(bodyHtml).toContain("Acme Corp");
    expect(bodyHtml).not.toContain("tags:");
    expect(bodyHtml).not.toContain("company: Acme Corp");
    expect(bodyHtml).not.toContain("---");
  });
});

describe("render → HTML pipeline", () => {
  const bodyHtml = renderResume(FIXTURE);

  test("produces header with name (no monogram by default)", () => {
    expect(bodyHtml).toContain("<h1>");
    expect(bodyHtml).toContain("Jane Doe");
    expect(bodyHtml).not.toContain('<div class="initials">');
  });

  test("header is closed exactly once", () => {
    const count = (bodyHtml.match(/<\/header>/g) || []).length;
    expect(count).toBe(1);
  });

  test("produces section dividers for each h2", () => {
    const dividers = bodyHtml.match(/class="section-divider"/g) || [];
    expect(dividers).toHaveLength(3); // Work Experience, Education, Skills
  });

  test("renders company headings as h3", () => {
    expect(bodyHtml).toContain("<h3>Acme Corp</h3>");
    expect(bodyHtml).toContain("<h3>Startup Inc</h3>");
    expect(bodyHtml).toContain("<h3>University of Testing</h3>");
  });

  test("renders bullet points", () => {
    expect(bodyHtml).toContain("<li>Built a configurable platform from scratch.</li>");
  });

  test("renders bold text in list items", () => {
    expect(bodyHtml).toContain("<strong>TypeScript</strong>");
  });

  test("renders italic tech stack lines", () => {
    expect(bodyHtml).toContain("<em>Technologies used: React, TypeScript, Next.js.</em>");
  });

  test("renders monogram when initials are provided", () => {
    const withInitials = renderResume(FIXTURE, { initials: "JD" });
    expect(withInitials).toContain('<div class="initials">');
    expect(withInitials).toContain("<span>J</span>");
    expect(withInitials).toContain("<span>D</span>");
  });
});

describe("full HTML assembly", () => {
  const bodyHtml = renderResume(FIXTURE);
  const fullHtml = buildHtml({
    bodyHtml,
    fontFaceCSS: "@font-face { font-family: 'IBM Plex Sans'; }",
    css: "body { color: #333; }",
    fontOverride: ":root { --font-primary: 'IBM Plex Sans', sans-serif; }",
    pdfTitle: "Jane Doe - Resume",
  });

  test("title is derived from h1", () => {
    expect(fullHtml).toContain("<title>Jane Doe - Resume</title>");
  });

  test("contains all three style blocks", () => {
    expect(fullHtml).toContain("@font-face { font-family: 'IBM Plex Sans'; }");
    expect(fullHtml).toContain("body { color: #333; }");
    expect(fullHtml).toContain("--font-primary: 'IBM Plex Sans', sans-serif");
  });

  test("body contains the rendered resume", () => {
    expect(fullHtml).toContain('<div class="resume-page">');
    expect(fullHtml).toContain("Jane Doe");
    expect(fullHtml).toContain("Acme Corp");
  });

  test("is a valid HTML document structure", () => {
    expect(fullHtml).toMatch(/^<!DOCTYPE html>/);
    expect(fullHtml).toContain('<html lang="en">');
    expect(fullHtml).toContain("</html>");
    expect(fullHtml).toContain("<head>");
    expect(fullHtml).toContain("</head>");
    expect(fullHtml).toContain("<body>");
    expect(fullHtml).toContain("</body>");
  });
});
