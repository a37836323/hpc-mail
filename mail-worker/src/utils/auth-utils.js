const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

function normalizeUsername(username) {
	return typeof username === 'string' ? username.trim() : '';
}

function isValidUsername(username) {
	const value = normalizeUsername(username);
	return (
		value.length >= USERNAME_MIN_LENGTH &&
		value.length <= USERNAME_MAX_LENGTH &&
		USERNAME_PATTERN.test(value) &&
		!value.startsWith('.') &&
		!value.endsWith('.') &&
		!value.includes('..')
	);
}

function usernameBase(value, fallback = 'user') {
	let base = normalizeUsername(value)
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/\.{2,}/g, '.')
		.replace(/^[.-]+|[.-]+$/g, '')
		.slice(0, USERNAME_MAX_LENGTH);

	if (base.length < USERNAME_MIN_LENGTH) {
		base = `${base || fallback}`.replace(/[^a-z0-9_-]+/g, '-');
	}

	if (base.length < USERNAME_MIN_LENGTH) {
		base = `${fallback}-${base}`;
	}

	return base.slice(0, USERNAME_MAX_LENGTH);
}

function isAdminRole(roleRow) {
	return roleRow?.key === 'admin';
}

export {
	USERNAME_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
	normalizeUsername,
	isValidUsername,
	usernameBase,
	isAdminRole
};
