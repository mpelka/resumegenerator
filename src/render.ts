interface RenderOptions {
  initials?: string;
  features?: {
    monogram?: boolean;
    sectionDividers?: boolean;
  };
}

export function renderResume(markdown: string, { initials, features = {} }: RenderOptions = {}): string {
  let html = Bun.markdown.html(markdown);

  // Transform h1 into header, optionally with monogram
  let inHeader = true;
  html = html.replace(/<h1>(.*?)<\/h1>/s, (_, content: string) => {
    const monogram =
      features.monogram !== false && initials
        ? `<div class="initials"><span>${initials[0]}</span><span>${initials[1]}</span></div>`
        : "";
    return `<header>${monogram}<h1>${content}</h1>`;
  });

  // Transform h2 — section dividers or plain headings depending on features
  html = html.replace(/<h2>(.*?)<\/h2>/g, (_, content: string) => {
    const closeHeader = inHeader ? "</header>" : "";
    inHeader = false;
    if (features.sectionDividers === false) {
      return `${closeHeader}<h2>${content}</h2>`;
    }
    return `${closeHeader}
          <div class="section-divider">
            <span>${content}</span>
            <div class="divider-line"></div>
          </div>`;
  });

  const closingTag = inHeader ? "</header>" : "";
  return `<div class="resume-page">${html}${closingTag}</div>`;
}
