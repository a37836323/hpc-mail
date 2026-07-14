export class FakeKV {
	constructor(entries = {}) {
		this.values = new Map(Object.entries(entries));
		this.puts = [];
		this.deletes = [];
	}

	async get(key, options) {
		const value = this.values.get(key);
		if (value == null) return null;
		if (options?.type === 'json') return typeof value === 'string' ? JSON.parse(value) : structuredClone(value);
		return typeof value === 'string' ? value : JSON.stringify(value);
	}

	async put(key, value, options) {
		this.values.set(key, value);
		this.puts.push({ key, value, options });
	}

	async delete(key) {
		this.values.delete(key);
		this.deletes.push(key);
	}
}

export function makeContext(kv = new FakeKV(), headers = {}) {
	const responseHeaders = new Map();
	const normalizedHeaders = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
	return {
		env: { kv, jwt_secret: 'unit-test-jwt-secret', admin: 'admin@example.com' },
		req: {
			url: 'https://mail.example.com/api/oauth/linuxDo/start',
			header: name => normalizedHeaders[String(name).toLowerCase()] || ''
		},
		header(name, value) {
			responseHeaders.set(name.toLowerCase(), value);
		},
		responseHeaders
	};
}
