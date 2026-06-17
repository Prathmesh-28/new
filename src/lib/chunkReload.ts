// Stale-deploy recovery. After a new build, hashed chunk filenames change; a tab
// still holding the previous index.html will 404 when it lazy-imports a renamed
// chunk ("Failed to fetch dynamically imported module"). We reload ONCE to pull
// the fresh index.html, guarded by a timestamp so a genuinely-missing chunk can
// never put us in a reload loop.
const KEY = "hr_chunk_reload_ts";

const PATTERNS = [
  /dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk \d+ failed/i,
  /ChunkLoadError/i,
  /Unable to preload CSS/i,
];

export function isChunkError(msg?: string | null): boolean {
  return !!msg && PATTERNS.some((re) => re.test(msg));
}

export function recoverFromChunkError(): boolean {
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY) || 0); } catch { /* private mode */ }
  if (Date.now() - last < 20000) return false; // just tried → don't loop
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ }
  window.location.reload();
  return true;
}
