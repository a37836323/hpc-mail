const SAFE_INLINE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);

function normalizeMimeType(value) {
	return String(value || '').split(';')[0].trim().toLowerCase();
}

function sanitizeFilename(value = 'download') {
	const filename = String(value || 'download')
		.replace(/[\r\n\0-\x1f\x7f]/g, '')
		.replace(/[\\/]+/g, '_')
		.replace(/["']/g, '')
		.trim()
		.slice(0, 180);
	return filename || 'download';
}

function dispositionFilename(disposition = '') {
	const match = String(disposition).match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
	if (!match) return 'download';
	try {
		return decodeURIComponent(match[1].replace(/^"|"$/g, ''));
	} catch (_) {
		return match[1];
	}
}

function contentDisposition(type, filename, requestedDisposition = '') {
	const safeFilename = sanitizeFilename(filename);
	const mode = SAFE_INLINE_IMAGE_TYPES.has(type) && /^inline\b/i.test(String(requestedDisposition)) ? 'inline' : 'attachment';
	return `${mode}; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
}

function secureAttachmentMetadata(metadata = {}, filename) {
	const requestedType = normalizeMimeType(metadata.contentType || metadata.type);
	const safeInline = SAFE_INLINE_IMAGE_TYPES.has(requestedType);
	const type = safeInline ? requestedType : 'application/octet-stream';
	const dispositionName = dispositionFilename(metadata.contentDisposition);
	const resolvedFilename = dispositionName !== 'download' ? dispositionName : filename || 'download';
	return {
		...metadata,
		contentType: type,
		contentDisposition: contentDisposition(type, resolvedFilename, metadata.contentDisposition)
	};
}

function secureObjectResponse(object, key = '') {
	if (!object) return new Response('Not found', { status: 404 });
	const isResponse = object instanceof Response;
	const headers = isResponse ? object.headers : new Headers();
	const metadata = isResponse ? {
		contentType: headers.get('Content-Type'),
		contentDisposition: headers.get('Content-Disposition'),
		cacheControl: headers.get('Cache-Control')
	} : {
		contentType: object.httpMetadata?.contentType,
		contentDisposition: object.httpMetadata?.contentDisposition,
		cacheControl: object.httpMetadata?.cacheControl
	};
	const secured = secureAttachmentMetadata(metadata, key.split('/').pop() || 'download');
	const responseHeaders = new Headers({
		'Content-Type': secured.contentType,
		'Content-Disposition': secured.contentDisposition,
		'X-Content-Type-Options': 'nosniff',
		'Content-Security-Policy': "sandbox; default-src 'none'",
		'Cache-Control': metadata.cacheControl || 'private, no-store'
	});
	return new Response(isResponse ? object.body : object.body, {
		status: isResponse ? object.status : 200,
		headers: responseHeaders
	});
}

export {
	SAFE_INLINE_IMAGE_TYPES,
	normalizeMimeType,
	sanitizeFilename,
	secureAttachmentMetadata,
	secureObjectResponse
};
