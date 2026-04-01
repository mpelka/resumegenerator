# resumegenerator

Markdown-to-PDF resume generator. Write your resume in markdown, get a styled, ATS-friendly PDF.

## Install

Requires [Bun](https://bun.sh).

```bash
bun i -g @mpelka/resumegenerator
```

This installs the CLI tool and Chromium browser automatically. Fonts are downloaded from Google Fonts on first run and cached locally.

**Optional:** install `pdftotext` for automatic page break analysis after PDF generation:

```bash
brew install poppler    # macOS
apt install poppler-utils  # Debian/Ubuntu
```

## Usage

```bash
resumegenerator --filename resume.md
```

| Flag | Description |
|------|-------------|
| `--filename` | Path to the markdown resume (required) |
| `--template` | Template name (default: `modern`) |
| `--initials` | Override auto-derived monogram initials |
| `--output-filename` | Override the output PDF filename |
| `--spacing` | Spacing multiplier (e.g. `0.8` = 80% of default gaps) |

The PDF is written next to the source `.md` file. Initials for the monogram are auto-derived from the `h1` name.

When `pdftotext` is available, the CLI automatically analyzes page breaks after generation:

```
PDF saved to: resume.pdf (2 pages)
✅ Page 1 break
   Last before break:  "Technologies used: React, TypeScript, Next.js."
   First after break:  "PREVIOUS COMPANY"
```

If a page has excessive empty space (>15 trailing blank lines), it warns about a possible bad break and suggests adjusting `--spacing`.

## Markdown format

```markdown
# Full Name

**Job Title**

Location • email@example.com • linkedin.com/in/handle

Summary paragraph with optional **bold** keywords.

## Work Experience

### Company Name
**Role Title** | Start Date - End Date

* Achievement with **keyword** highlights

*Technologies used: Tech1, Tech2, Tech3.*

---

### Previous Company
**Earlier Role** | Start Date - End Date

* Another achievement

## Education

### University Name
**Degree** | Start Year - End Year

## Skills

- **Category:** Item1 • Item2 • Item3
```

YAML frontmatter is supported and stripped before rendering.

Any content before the first `# Name` heading is ignored during rendering. This lets you embed job descriptions, notes, or other reference material above the resume — useful when keeping the job posting and tailored resume in a single file:

```markdown
---
company: Acme Corp
status: applied
---

## Job Description
Looking for a Senior Frontend Developer...

---

# Full Name
...resume content...
```

Use `---` (horizontal rule) between work experience entries to group each role into a block. This enables `break-inside: avoid` in the PDF — Chromium will keep each entry on the same page when possible, preventing orphaned company headings at page breaks.

## Templates

Each template defines its own fonts, colors, and layout features. Pass `--template <name>` to switch.

| Template | Description |
|----------|-------------|
| `modern` (default) | Clean sans-serif (IBM Plex Sans) with monogram badge and section divider lines |
| `technical` | Monospace (IBM Plex Mono) with outlined circle monogram and minimal section labels |

Templates live in `templates/<name>/` with two files:
- `style.css` — layout, margins (`@page`), and visual styling
- `template.js` — config (fonts, colors, feature flags)

## Customizing templates

To create a new template, add a directory under `templates/` with:

**`template.js`** — exports a config object:

```js
export default {
  fonts: { primary: "IBM Plex Sans", secondary: "IBM Plex Mono" },
  colors: {
    body: "#323336",
    subtitle: "#707678",
    sectionLabel: "#a6aaad",
    accent: "#42f398",
    border: "#e0e0e0",
  },
  features: {
    monogram: true,        // render initials badge
    sectionDividers: true, // "EXPERIENCE ————" style dividers
  },
};
```

**`style.css`** — template-specific styles, including page margins via `@page`. Uses CSS variables (`--font-primary`, `--font-secondary`, `--color-*`) injected from the config at build time.

Font families must be present in the `GOOGLE_FONTS_URL` map in `src/utils.ts`.

## How it works

The CLI parses your markdown, renders it to semantic HTML with configurable templates, downloads and caches Google Fonts as TTF files, then uses Playwright's Chromium to generate a tagged PDF. The result is an ATS-optimized document with proper text selection, heading structure, and PDF link annotations.

## ATS optimization

The generated PDFs are optimized for Applicant Tracking Systems and AI-based resume screening:

- **Tagged PDF** — embeds a structural tag tree (headings, paragraphs, lists) for correct semantic parsing
- **PDF metadata** — title is set to `Name - Resume` (not the temp filename)
- **Single-column layout** — no tables, columns, or complex layouts that break ATS parsers
- **Real text** — all content is selectable text, not images
- **Semantic HTML** — clean heading hierarchy (h1/h2/h3) with standard section names
- **Hyperlinks** — email, LinkedIn, and GitHub are embedded as proper PDF link annotations

## Font strategy

The CLI downloads full TTF files from Google Fonts rather than using CDN `<link>` tags. Google Fonts CDN serves WOFF2 files split into `unicode-range` subsets, and when Playwright embeds these into a PDF the character-to-glyph mapping fragments — text looks correct but copy-paste produces garbled output, breaking ATS parsers. Fetching with a basic Linux User-Agent returns un-subsetted TTF URLs that produce clean character maps. A temp HTML file is written so the page loads with a `file://` origin, which is required for Chromium to access the locally cached font files.
