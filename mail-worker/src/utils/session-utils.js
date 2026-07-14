import constant from '../const/constant';

function nowSeconds(now = Date.now()) {
	return Math.floor(now / 1000);
}

function sessionExpiry(now = Date.now(), lifetime = constant.TOKEN_EXPIRE) {
	return nowSeconds(now) + lifetime;
}

function ensureSessionExpiry(authInfo, now = Date.now()) {
	if (!authInfo.expiresAt || !Number.isFinite(Number(authInfo.expiresAt))) {
		authInfo.expiresAt = sessionExpiry(now);
	}
	return Number(authInfo.expiresAt);
}

function isSessionExpired(authInfo, now = Date.now()) {
	return !authInfo || ensureSessionExpiry(authInfo, now) <= nowSeconds(now);
}

function remainingSessionTtl(authInfo, now = Date.now()) {
	return Math.max(1, ensureSessionExpiry(authInfo, now) - nowSeconds(now));
}

function addSessionToken(authInfo, token, userRow, now = Date.now()) {
	const { password: _password, salt: _salt, ...safeUser } = userRow;
	const existing = authInfo && authInfo.user?.userId === userRow.userId && !isSessionExpired(authInfo, now);
	const info = existing
		? authInfo
		: { tokens: [], user: safeUser, refreshTime: new Date(now).toISOString(), expiresAt: sessionExpiry(now) };
	info.tokens = Array.isArray(info.tokens) ? info.tokens.filter(item => typeof item === 'string') : [];
	while (info.tokens.length >= 10) info.tokens.shift();
	info.tokens.push(token);
	info.user = safeUser;
	info.expiresAt = Math.max(ensureSessionExpiry(info, now), sessionExpiry(now));
	return info;
}

function removeSessionToken(authInfo, token) {
	if (!authInfo || !Array.isArray(authInfo.tokens)) return authInfo;
	authInfo.tokens = authInfo.tokens.filter(item => item !== token);
	return authInfo;
}

async function putAuthInfo(c, userId, authInfo, now = Date.now()) {
	await c.env.kv.put(`auth-uid:${userId}`, JSON.stringify(authInfo), {
		expirationTtl: remainingSessionTtl(authInfo, now)
	});
}

export {
	nowSeconds,
	sessionExpiry,
	ensureSessionExpiry,
	isSessionExpired,
	remainingSessionTtl,
	addSessionToken,
	removeSessionToken,
	putAuthInfo
};
