/** 统计 HTML 中会被隐私策略拦截的远程图片数量（http/https 源；data:/cid:/blob:/相对路径不计）。 */
export function countRemoteImages(html: string): number {
  if (!html) return 0;
  const pattern = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const src = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (/^https?:\/\//i.test(src)) count += 1;
  }
  return count;
}
