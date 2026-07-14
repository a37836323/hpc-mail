/** 零宽 / 不间断空格等不可见字符，折叠为普通空格 */
const INVISIBLE = new RegExp(
  "[\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF\\u00AD\\u034F\\u00A0\\u3000]",
  "g",
);

/** 无依赖的 HTML → 纯文本（收件解析与摘要用，禁止引入 linkedom 等重依赖） */
export function htmlToText(html: string | undefined | null): string {
  return String(html || '')
    .replace(/<(script|style|head|template)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(INVISIBLE, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 正文纯文本摘要：优先纯文本，回落 html→text，截断到 limit 字符 */
export function makePreview(
  text: string | undefined | null,
  html: string | undefined | null,
  limit = 160,
): string {
  const source = (text && text.trim()) || htmlToText(html);
  return source.replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}
