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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * 把正文编码成折行的 base64，配 `encoding: 'base64'` 使用。
 *
 * mimetext 的 dump 是 `headers + CRLF + CRLF + data` 原样拼接——`encoding` 选项只写进
 * Content-Transfer-Encoding 头，**不会真的编码数据**。默认的 7bit 有两个问题：
 * ① 一段不换行的中文超过约 330 字就突破 RFC 5322 的 998 字节行限（转发压成一行的营销
 *    邮件 HTML 更是几十 KB 一行），严格 MTA 会拒收——和附件 base64 不折行是同一类问题；
 * ② 声明 7bit 却塞 8-bit UTF-8 本身就不合规。
 */
export function encodeBodyBase64(s: string): string {
  return foldBase64(bytesToBase64(new TextEncoder().encode(s)));
}

/** 清洗后为空时的兜底文件名 */
const FALLBACK_FILENAME = 'attachment';

/**
 * 清洗 MIME 参数值（附件 filename / contentType）。
 *
 * mimetext 拼头是裸拼接——`Content-Disposition: attachment; filename="${value}"`，
 * 既不做 RFC 2047 编码也不转义引号和 CRLF。而入站转发路径的文件名完全由站外发件人控制：
 * postal-mime 解 RFC 2047 encoded-word / RFC 2231 续行后的值可以含裸 CRLF 和引号，
 * 足以在我们**代发**的邮件里改写 part 头结构（同一 part 出现两个 Content-Type，
 * 让扫描网关与收件客户端对内容类型的判定产生分歧）。
 *
 * 同时限长：转发路径对文件名长度没有上限，超长值会撑出 >998 字节的头行被下游 MTA 拒收。
 */
export function sanitizeMimeParam(value: string, maxLen = 200): string {
  return value.replace(/[\r\n\t"\\;]/g, '').slice(0, maxLen).trim();
}

/** 清洗附件文件名；清完为空则退回占位名（不能让 filename="" 进头） */
export function sanitizeFilename(value: string, maxLen = 200): string {
  return sanitizeMimeParam(value, maxLen) || FALLBACK_FILENAME;
}

/** 清洗 MIME 类型；非法则退回通用二进制类型 */
export function sanitizeMimeType(value: string): string {
  const cleaned = sanitizeMimeParam(value, 128);
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(cleaned)
    ? cleaned
    : 'application/octet-stream';
}
