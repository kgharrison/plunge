// Client-side cache for equipment/settings data
// Shows cached data immediately, then refreshes in background

const CACHE_KEY = 'plunge_equipment_cache';
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes - after this, show loading while fetching

interface CachedData {
  config: unknown | null;
  pump: unknown | null;
  systemTime: unknown | null;
  status: unknown | null;
  timestamp: number;
}

export function loadCache(): CachedData | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(CACHE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
}

export function saveCache(data: Partial<CachedData>): void {
  if (typeof window === 'undefined') return;
  const existing = loadCache();
  const updated: CachedData = {
    config: data.config ?? existing?.config ?? null,
    pump: data.pump ?? existing?.pump ?? null,
    systemTime: data.systemTime ?? existing?.systemTime ?? null,
    status: data.status ?? existing?.status ?? null,
    timestamp: Date.now(),
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
}

export function isCacheStale(): boolean {
  const cache = loadCache();
  if (!cache) return true;
  return Date.now() - cache.timestamp > CACHE_MAX_AGE;
}

export function clearCache(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CACHE_KEY);
}
