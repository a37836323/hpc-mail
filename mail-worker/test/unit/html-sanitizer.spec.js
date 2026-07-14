import { describe, expect, it } from 'vitest';
import { sanitizeEmailHtml } from '../../src/utils/html-sanitizer';
import emailHtmlTemplate from '../../src/template/email-html';
import emailTextTemplate from '../../src/template/email-text';

describe('Telegram email view sanitization', () => {
	it('removes executable markup, event handlers, styles, dangerous URLs and remote images', () => {
		const dirty = `<script>alert(1)</script><svg onload="alert(2)"><circle /></svg>
			<a href="javascript:alert(3)" onclick="alert(4)" style="color:red">bad</a>
			<img src="https://tracker.example/pixel.gif" srcset="https://evil/x 2x" onerror="alert(5)">
			<img src="{{domain}}safe/image.png" alt="safe">`;
		const clean = sanitizeEmailHtml(dirty);
		expect(clean).not.toMatch(/script|svg|onload|onclick|onerror|style=|javascript:|tracker\.example|srcset/i);
		expect(clean).toContain('src="{{domain}}safe/image.png"');
	});

	it('adds safe link isolation and never uses client-side innerHTML', () => {
		const html = emailHtmlTemplate('<a href="https://example.com">Example</a>', 'assets.example.com');
		expect(html).toContain('rel="noopener noreferrer nofollow"');
		expect(html).not.toContain('innerHTML');
	});

	it('HTML-escapes the plain-text fallback', () => {
		const html = emailTextTemplate(`<img src=x onerror=alert(1)> & "quoted"`);
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
		expect(html).toContain('&amp;');
		expect(html).not.toContain('<img src=x');
	});
});
