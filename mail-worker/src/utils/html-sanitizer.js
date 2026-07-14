import { parseHTML } from 'linkedom';

const ALLOWED_TAGS = new Set([
	'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li',
	'ol', 'p', 'pre', 's', 'span', 'strong', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
]);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript']);
const SAFE_SIMPLE_ATTRIBUTES = new Set(['title', 'colspan', 'rowspan', 'width', 'height', 'align']);

function safeLink(value) {
	try {
		const url = new URL(value, 'https://invalid.local');
		return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? value : '';
	} catch (_) {
		return '';
	}
}

function safeImage(value) {
	return typeof value === 'string' && value.startsWith('{{domain}}') ? value : '';
}

function sanitizeEmailHtml(html = '') {
	const { document } = parseHTML(`<!doctype html><html><body>${typeof html === 'string' ? html : ''}</body></html>`);
	const elements = Array.from(document.body.querySelectorAll('*')).reverse();

	for (const element of elements) {
		const tag = element.localName.toLowerCase();
		if (!ALLOWED_TAGS.has(tag)) {
			if (DROP_WITH_CONTENT.has(tag)) {
				element.remove();
			} else {
				element.replaceWith(...Array.from(element.childNodes));
			}
			continue;
		}

		for (const attribute of Array.from(element.attributes)) {
			const name = attribute.name.toLowerCase();
			const value = attribute.value;
			if (name.startsWith('on') || name === 'style' || name === 'srcset' || name === 'formaction') {
				element.removeAttribute(attribute.name);
				continue;
			}
			if (tag === 'a' && name === 'href') {
				const href = safeLink(value);
				if (href) {
					element.setAttribute('href', href);
					element.setAttribute('target', '_blank');
					element.setAttribute('rel', 'noopener noreferrer nofollow');
				} else {
					element.removeAttribute(attribute.name);
				}
				continue;
			}
			if (tag === 'img' && name === 'src') {
				const src = safeImage(value);
				if (src) element.setAttribute('src', src);
				else element.removeAttribute(attribute.name);
				continue;
			}
			if (tag === 'img' && name === 'alt') continue;
			if (!SAFE_SIMPLE_ATTRIBUTES.has(name)) element.removeAttribute(attribute.name);
		}
	}

	return document.body.innerHTML;
}

export { sanitizeEmailHtml, safeLink, safeImage };
