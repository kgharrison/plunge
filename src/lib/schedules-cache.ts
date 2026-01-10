// Client-side cache for schedules data
// Shows cached data immediately, then refreshes in background

const CACHE_KEY = 'plunge_schedules_cache';
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes - after this, show loading while fetching

interface CachedSchedulesData {
  schedules: unknown | null;
  circuits: unknown | null;
  timestamp: number;
}

export function loadSchedulesCache(): CachedSchedulesData | null {
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

export function saveSchedulesCache(data: Partial<CachedSchedulesData>): void {
  if (typeof window === 'undefined') return;
  const existing = loadSchedulesCache();
  const updated: CachedSchedulesData = {
    schedules: data.schedules ?? existing?.schedules ?? null,
    circuits: data.circuits ?? existing?.circuits ?? null,
    timestamp: Date.now(),
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
}

export function isSchedulesCacheStale(): boolean {
  const cache = loadSchedulesCache();
  if (!cache) return true;
  return Date.now() - cache.timestamp > CACHE_MAX_AGE;
}

export function clearSchedulesCache(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CACHE_KEY);
}
