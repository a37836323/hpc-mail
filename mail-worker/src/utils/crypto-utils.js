const encoder = new TextEncoder();
const PBKDF2_VERSION = 'pbkdf2-sha256';
// Cloudflare Workers rejects PBKDF2 requests above 100,000 iterations.
const PBKDF2_MAX_ITERATIONS = 100000;
const PBKDF2_ITERATIONS = PBKDF2_MAX_ITERATIONS;
const PBKDF2_KEY_BYTES = 32;

function bytesToBase64url(bytes) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlToBytes(value) {
	let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	while (normalized.length % 4) normalized += '=';
	return Uint8Array.from(atob(normalized), character => character.charCodeAt(0));
}

function constantTimeEqual(left, right) {
	const a = left instanceof Uint8Array ? left : new Uint8Array(left);
	const b = right instanceof Uint8Array ? right : new Uint8Array(right);
	let mismatch = a.length ^ b.length;
	const length = Math.max(a.length, b.length);
	for (let index = 0; index < length; index++) {
		mismatch |= (a[index] || 0) ^ (b[index] || 0);
	}
	return mismatch === 0;
}

const saltHashUtils = {
	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return bytesToBase64url(array);
	},

	async hashPassword(password, iterations = PBKDF2_ITERATIONS) {
		const salt = this.generateSalt();
		const derived = await this.derivePbkdf2(password, salt, iterations);
		const hash = `${PBKDF2_VERSION}$${iterations}$${salt}$${bytesToBase64url(derived)}`;
		return { salt, hash };
	},

	async derivePbkdf2(password, salt, iterations = PBKDF2_ITERATIONS) {
		const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
		const bits = await crypto.subtle.deriveBits(
			{ name: 'PBKDF2', hash: 'SHA-256', salt: base64urlToBytes(salt), iterations },
			key,
			PBKDF2_KEY_BYTES * 8
		);
		return new Uint8Array(bits);
	},

	async genHashPassword(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		if (typeof storedHash !== 'string') return false;
		if (storedHash.startsWith(`${PBKDF2_VERSION}$`)) {
			try {
				const [version, iterationValue, encodedSalt, encodedHash] = storedHash.split('$');
				if (version !== PBKDF2_VERSION || !encodedSalt || !encodedHash) return false;
				const iterations = Number(iterationValue);
				if (!Number.isInteger(iterations) || iterations < 100000 || iterations > PBKDF2_MAX_ITERATIONS) return false;
				const actual = await this.derivePbkdf2(inputPassword, encodedSalt, iterations);
				return constantTimeEqual(actual, base64urlToBytes(encodedHash));
			} catch (_) {
				return false;
			}
		}

		const legacyHash = await this.genHashPassword(inputPassword, salt);
		return constantTimeEqual(encoder.encode(legacyHash), encoder.encode(storedHash));
	},

	needsRehash(storedHash) {
		if (typeof storedHash !== 'string' || !storedHash.startsWith(`${PBKDF2_VERSION}$`)) return true;
		const iterations = Number(storedHash.split('$')[1]);
		return !Number.isInteger(iterations) || iterations !== PBKDF2_ITERATIONS;
	},

	genRandomPwd(length = 16) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let result = '';
		const unbiasedLimit = Math.floor(256 / chars.length) * chars.length;
		while (result.length < length) {
			const bytes = new Uint8Array(Math.max(16, length - result.length));
			crypto.getRandomValues(bytes);
			for (const byte of bytes) {
				if (byte >= unbiasedLimit) continue;
				result += chars[byte % chars.length];
				if (result.length === length) break;
			}
		}
		return result;
	}
};

export { PBKDF2_VERSION, PBKDF2_ITERATIONS, PBKDF2_MAX_ITERATIONS, constantTimeEqual };
export default saltHashUtils;
