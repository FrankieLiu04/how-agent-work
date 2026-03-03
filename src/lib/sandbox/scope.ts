const SCOPE_ROOT = "/__scopes";

export function getScopeRoot(): string {
  return SCOPE_ROOT;
}

export function normalizeUserPath(path: string): string {
  const raw = path.trim();
  if (!raw) return "/";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
  return collapsed === "" ? "/" : collapsed;
}

export function buildScopePrefix(scopeId: string): string {
  return `${SCOPE_ROOT}/${scopeId}`;
}

export function toStoredPath(path: string, scopeId?: string | null): string {
  const normalized = normalizeUserPath(path);
  if (!scopeId) return normalized;
  return `${buildScopePrefix(scopeId)}${normalized}`;
}

export function fromStoredPath(storedPath: string, scopeId?: string | null): string {
  if (!scopeId) return storedPath;
  const prefix = buildScopePrefix(scopeId);
  if (storedPath === prefix) return "/";
  if (storedPath.startsWith(`${prefix}/`)) {
    return storedPath.slice(prefix.length);
  }
  return storedPath;
}

export function isReservedSandboxPath(path: string): boolean {
  return normalizeUserPath(path).startsWith(`${SCOPE_ROOT}/`);
}

