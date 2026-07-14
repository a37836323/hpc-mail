import createDOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'blockquote', 'br', 'caption',
  'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details', 'div',
  'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'header', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'main', 'mark',
  'ol', 'p', 'pre', 'q', 's', 'samp', 'section', 'small', 'span', 'strong',
  'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead',
  'time', 'tr', 'u', 'ul', 'var', 'wbr',
]

const ALLOWED_ATTR = [
  'abbr', 'align', 'alt', 'aria-label', 'aria-labelledby', 'class', 'colspan',
  'dir', 'height', 'href', 'id', 'lang', 'name', 'rel', 'role', 'rowspan',
  'scope', 'span', 'src', 'start', 'summary', 'target', 'title', 'valign', 'value',
  'width',
]

const FORBIDDEN_TAGS = [
  'applet', 'audio', 'base', 'button', 'canvas', 'embed', 'form', 'frame',
  'frameset', 'iframe', 'input', 'link', 'meta', 'object', 'script', 'select',
  'source', 'style', 'svg', 'template', 'textarea', 'video',
]

function isSafeLink(value, baseOrigin) {
  const source = String(value || '').trim()
  if (!source) return false
  if (source.startsWith('#') || source.startsWith('/')) return true
  try {
    const parsed = new URL(source, baseOrigin)
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

function isSafeImage(value, baseOrigin, trustedOrigins) {
  const source = String(value || '').trim()
  if (!source) return false
  if (/^(cid:|blob:|data:image\/(?:avif|gif|jpeg|png|webp);base64,)/i.test(source)) return true
  try {
    const parsed = new URL(source, baseOrigin)
    return parsed.origin === baseOrigin || trustedOrigins.has(parsed.origin)
  } catch {
    return false
  }
}

/**
 * Sanitize hostile email markup before it reaches any rendering boundary.
 * Inline CSS is deliberately removed: CSS URLs can act as tracking pixels and
 * legacy CSS features are not a safe formatting boundary for untrusted mail.
 */
export function sanitizeEmailHtml(html, options = {}) {
  const windowObject = options.window || globalThis.window
  if (!windowObject?.document) throw new TypeError('A DOM window is required to sanitize email HTML')

  const baseOrigin = options.baseOrigin || windowObject.location?.origin || 'https://localhost'
  const trustedOrigins = new Set((options.trustedImageOrigins || []).map(value => {
    try { return new URL(value, baseOrigin).origin } catch { return '' }
  }).filter(Boolean))
  const purifier = createDOMPurify(windowObject)
  const clean = purifier.sanitize(String(html || ''), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_ARIA_ATTR: true,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: ['style', 'srcset', 'formaction', 'xlink:href'],
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
  })

  const template = windowObject.document.createElement('template')
  template.innerHTML = clean

  template.content.querySelectorAll('a[href]').forEach(link => {
    if (!isSafeLink(link.getAttribute('href'), baseOrigin)) {
      link.removeAttribute('href')
      link.removeAttribute('target')
      return
    }
    if (/^https?:/i.test(link.href)) {
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
    }
  })

  template.content.querySelectorAll('img').forEach(image => {
    const source = image.getAttribute('src')
    if (!isSafeImage(source, baseOrigin, trustedOrigins)) {
      image.removeAttribute('src')
      image.classList.add('remote-image-blocked')
    }
    image.removeAttribute('srcset')
    image.loading = 'lazy'
    image.referrerPolicy = 'no-referrer'
  })

  return template.innerHTML
}
