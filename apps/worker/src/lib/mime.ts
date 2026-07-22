/**
 * base64 按 RFC 2045 折行（76 字符 + CRLF）。
 * mimetext 的 dump 会把附件 data 原样拼进 MIME，不折行的话整个附件是一行，
 * 超出 SMTP/RFC 5322 单行 998 字节硬限，QQ 邮箱等严格 MTA 会静默拒收。
 */
export function foldBase64(b64: string): string {
  if (b64.length <= 76) return b64;
  const parts: string[] = [];
  for (let i = 0; i < b64.length; i += 76) {
    parts.push(b64.slice(i, i + 76));
  }
  return parts.join('\r\n');
}
