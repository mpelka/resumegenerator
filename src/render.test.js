import { describe, expect, test } from "bun:test";
import { renderResume } from "./render.js";

describe("renderResume", () => {
  test("h1 produces header with name", () => {
    const html = renderResume("# Jane Doe");
    expect(html).toContain("<header>");
    expect(html).toContain("<h1>");
    expect(html).toContain("Jane Doe");
  });

  test("renders monogram when initials are provided", () => {
    const html = renderResume("# Jane Doe", { initials: "JD" });
    expect(html).toContain('<div class="initials">');
    expect(html).toContain("<span>J</span>");
    expect(html).toContain("<span>D</span>");
  });

  test("omits monogram when initials are absent", () => {
    const html = renderResume("# Jane Doe");
    expect(html).not.toContain('<div class="initials">');
  });

  test("h2 closes header and produces section divider", () => {
    const html = renderResume("# Name\n\n## Experience");
    expect(html).toContain("</header>");
    expect(html).toContain('<div class="section-divider">');
    expect(html).toContain("<span>Experience</span>");
    expect(html).toContain('<div class="divider-line">');
  });

  test("h3 produces a heading tag", () => {
    const html = renderResume("# Name\n\n## Section\n\n### Company");
    expect(html).toContain("<h3>Company</h3>");
  });

  test("header is closed even without h2", () => {
    const html = renderResume("# Name\n\nSome content");
    expect(html).toContain("</header>");
  });

  test("header is not double-closed when h2 exists", () => {
    const html = renderResume("# Name\n\n## Section");
    const closingCount = (html.match(/<\/header>/g) || []).length;
    expect(closingCount).toBe(1);
  });

  test("wraps output in resume-page div", () => {
    const html = renderResume("# Name");
    expect(html).toMatch(/^<div class="resume-page">/);
    expect(html).toMatch(/<\/div>$/);
  });

  test("renders bullet lists", () => {
    const html = renderResume("# Name\n\n## Work\n\n- Item one\n- Item two");
    expect(html).toContain("<li>Item one</li>");
    expect(html).toContain("<li>Item two</li>");
  });

  test("renders bold and italic inline", () => {
    const html = renderResume("# Name\n\n## Work\n\n**bold** and *italic*");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  test("omits monogram when features.monogram is false even with initials", () => {
    const html = renderResume("# Jane Doe", { initials: "JD", features: { monogram: false } });
    expect(html).not.toContain('<div class="initials">');
  });

  test("renders plain h2 when features.sectionDividers is false", () => {
    const html = renderResume("# Name\n\n## Experience", { features: { sectionDividers: false } });
    expect(html).toContain("<h2>Experience</h2>");
    expect(html).not.toContain("section-divider");
    expect(html).not.toContain("divider-line");
  });

  test("still closes header on h2 when sectionDividers is false", () => {
    const html = renderResume("# Name\n\n## Section", { features: { sectionDividers: false } });
    expect(html).toContain("</header>");
    const closingCount = (html.match(/<\/header>/g) || []).length;
    expect(closingCount).toBe(1);
  });
});
