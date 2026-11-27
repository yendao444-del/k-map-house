// The exported invoice/contract HTML is rendered in a separate, sandboxed
// window (image capture, print). That window has none of the app's compiled
// Tailwind / Font Awesome CSS, so the markup copied from the modal renders
// unstyled. Inline every same-origin stylesheet the app currently uses.

const absolutizeUrls = (cssText: string, base: string): string =>
  cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote: string, rawUrl: string) => {
    const url = rawUrl.trim();
    if (/^(data:|blob:|#)/i.test(url)) return match;
    try {
      return `url(${quote}${new URL(url, base).href}${quote})`;
    } catch {
      return match;
    }
  });

export const collectDocumentCss = (): string => {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet, not readable
    }
    const base = sheet.href || document.baseURI;
    const text = Array.from(rules, (rule) => rule.cssText).join('\n');
    chunks.push(absolutizeUrls(text, base));
  }
  // Never let a stylesheet terminate the inline <style> element early.
  return chunks.join('\n').replace(/<\/style/gi, '<\\/style');
};
