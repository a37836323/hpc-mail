import { describe, expect, it } from 'vitest';
import { secureAttachmentMetadata, secureObjectResponse } from '../../src/utils/attachment-security';

describe('attachment response hardening', () => {
	it.each([
		['text/html', 'payload.html'],
		['image/svg+xml', 'payload.svg'],
		['application/xml', 'payload.xml']
	])('forces %s to a sandboxed download', async (contentType, filename) => {
		const source = new Response('<script>alert(1)</script>', {
			headers: { 'Content-Type': contentType, 'Content-Disposition': `inline; filename="${filename}"` }
		});
		const response = secureObjectResponse(source, filename);
		expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
		expect(response.headers.get('Content-Disposition')).toMatch(/^attachment;/);
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Content-Security-Policy')).toContain('sandbox');
		expect(await response.text()).toContain('<script>');
	});

	it('allows only a strict raster image allowlist to render inline', () => {
		const metadata = secureAttachmentMetadata({ contentType: 'image/png', contentDisposition: 'inline; filename="safe.png"' });
		expect(metadata.contentType).toBe('image/png');
		expect(metadata.contentDisposition).toMatch(/^inline;/);
	});

	it('sanitizes path separators and header injection from filenames', () => {
		const metadata = secureAttachmentMetadata({
			contentType: 'text/plain',
			contentDisposition: 'attachment; filename="../evil\r\nX-Test: injected.txt"'
		});
		expect(metadata.contentDisposition).not.toContain('\r');
		expect(metadata.contentDisposition).not.toContain('\n');
		expect(metadata.contentDisposition).not.toContain('../');
	});
});
