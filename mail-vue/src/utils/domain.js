export function normalizeDomain(value) {
  return String(value || '').trim().replace(/^@+/, '').replace(/\.+$/, '').toLowerCase()
}

export function normalizeDomainList(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,，;；\s]+/)
      : []
  return [...new Set(source.map(normalizeDomain).filter(Boolean))]
}

/**
 * Resolve configured domains against a role's allow-list.
 * An empty role list and `*` retain the backend's "all configured domains"
 * semantics. Global wildcard users are treated as administrators.
 */
export function resolveAuthorizedDomains(configuredDomains, roleDomains, globalWildcard = false) {
  const configured = normalizeDomainList(configuredDomains)
  const allowed = normalizeDomainList(roleDomains)
  if (globalWildcard || allowed.length === 0 || allowed.includes('*')) return configured
  const allowedSet = new Set(allowed)
  return configured.filter(domain => allowedSet.has(domain))
}
