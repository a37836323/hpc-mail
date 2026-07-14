const SAFE_INLINE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
]);

export function normalizeMimeType(value: string | undefined | null): string {
  return String(value || '')
    .split(';')[0]
    ?.trim()
    .toLowerCase() ?? '';
}

export function sanitizeFilename(value: string | undefined | null = 'download'): string {
  const filename = String(value || 'download')
    // eslint-disable-next-line no-control-regex
    .replace(/[\r\n\0\x01-\x1f\x7f]/g, '')
    .replace(/[\\/]+/g, '_')
    .replace(/["']/g, '')
    .trim()
    .slice(0, 180);
  return filename || 'download';
}

/** 生成安全下载响应头：图片可 inline，其余强制 attachment + octet-stream */
export function buildSecureHeaders(
  requestedType: string | undefined | null,
  filename: string,
): Headers {
  const normalized = normalizeMimeType(requestedType);
  const safeInline = SAFE_INLINE_IMAGE_TYPES.has(normalized);
  const type = safeInline ? normalized : 'application/octet-stream';
  const safeFilename = sanitizeFilename(filename);
  const mode = safeInline ? 'inline' : 'attachment';
  return new Headers({
    'Content-Type': type,
    'Content-Disposition': `${mode}; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'Cache-Control': 'private, no-store',
  });
}

export { SAFE_INLINE_IMAGE_TYPES };
