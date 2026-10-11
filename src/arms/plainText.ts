const layoutTags =
  /<\/?(?:a|img|picture|source|h[1-6]|sub|sup|br|hr|p|div|span|summary|b|i|strong|em|code|pre|table|thead|tbody|tr|td|th|ul|ol|li)\b[^>]*>/gi;

const toolNames = /\b(shadowclone|openqodex|greptile|greptileai|claude|codex)\b/gi;

export function plainText(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<details>[\s\S]*?<\/details>/gi, " ")
    .replace(layoutTags, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\*\*/g, "")
    .replace(/^\s*(?:#{1,6}\s|>\s?)/gm, "")
    .replace(toolNames, "the reviewer")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_500);
}
