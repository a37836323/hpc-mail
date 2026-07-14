import domainUtils from '../utils/domain-uitls';
import { sanitizeEmailHtml } from '../utils/html-sanitizer';

export default function emailHtmlTemplate(html, domain) {
	const safeHtml = sanitizeEmailHtml(html).replace(/{{domain}}/g, domainUtils.toOssDomain(domain) + '/');
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        html, body { margin: 0; padding: 0; background: #fff; color: #13181d; }
        body { box-sizing: border-box; padding: 15px 10px; overflow: auto; font: 14px/1.5 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; word-break: break-word; }
        img { max-width: 100%; height: auto; }
        table { max-width: 100%; border-collapse: collapse; }
        a { color: #0e70df; }
        pre { white-space: pre-wrap; }
    </style>
</head>
<body>${safeHtml}</body>
</html>`;
}
