const TOKEN_STORAGE_KEY = 'token';
const TOKEN_EVENT = 'hpc-mail:token-change';

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  const value = storage()?.getItem(TOKEN_STORAGE_KEY)?.trim();
  return value || null;
}

export function setAuthToken(token: string): void {
  const normalized = token.trim();
  if (!normalized) {
    clearAuthToken();
    return;
  }
  storage()?.setItem(TOKEN_STORAGE_KEY, normalized);
  globalThis.dispatchEvent?.(new CustomEvent(TOKEN_EVENT, { detail: normalized }));
}

export function clearAuthToken(): void {
  storage()?.removeItem(TOKEN_STORAGE_KEY);
  globalThis.dispatchEvent?.(new CustomEvent(TOKEN_EVENT, { detail: null }));
}

export function subscribeAuthToken(listener: () => void): () => void {
  const handleTokenChange = () => listener();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_STORAGE_KEY) listener();
  };
  globalThis.addEventListener?.(TOKEN_EVENT, handleTokenChange);
  globalThis.addEventListener?.('storage', handleStorage);
  return () => {
    globalThis.removeEventListener?.(TOKEN_EVENT, handleTokenChange);
    globalThis.removeEventListener?.('storage', handleStorage);
  };
}

export { TOKEN_STORAGE_KEY };
