'use client';

import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';

// Cache for home page status data
const STATUS_CACHE_KEY = 'plunge_status_cache';
const SCHEDULES_CACHE_KEY = 'plunge_schedules_cache';

interface CachedStatus {
  data: PoolStatus;
  timestamp: number;
}

interface CachedSchedules {
  data: ScheduleEvent[];
  timestamp: number;
}

function loadStatusCache(): CachedStatus | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(STATUS_CACHE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
}

function saveStatusCache(data: PoolStatus): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
}

function loadSchedulesCache(): CachedSchedules | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(SCHEDULES_CACHE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
}

function saveSchedulesCache(data: ScheduleEvent[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SCHEDULES_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
}

interface PoolBody {
  bodyType: number;
  name: string;
  currentTemp: number;
  setPoint: number;
  heatMode: number;
  heatStatus: boolean;
}

interface Circuit {
  id: number;
  name: string;
  state: boolean;
}

interface PoolStatus {
  connected: boolean;
  lastUpdated: string;
  airTemp: number;
  bodies: PoolBody[];
  circuits: Circuit[];
  connectionType?: 'local' | 'remote' | 'demo';
  pumpIds?: number[];
  freezeMode?: boolean;
  poolDelay?: boolean;
  spaDelay?: boolean;
  cleanerDelay?: boolean;
}

interface Credentials {
  systemName: string;
  password: string;
}

interface ScheduleEvent {
  scheduleId: number;
  circuitId: number;
  startTime: number;
  stopTime: number;
  dayMask: number;
}

const CREDENTIALS_KEY = 'plunge_credentials';

function loadCredentials(): Credentials | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(CREDENTIALS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
}

function getAuthHeaders(credentials: Credentials | null): HeadersInit {
  if (!credentials) return {};
  return {
    'X-Pool-System-Name': credentials.systemName,
    'X-Pool-Password': credentials.password,
  };
}

const HEAT_MODES: Record<number, string> = {
  0: 'off',
  1: 'solar',
  2: 'solar-preferred',
  3: 'heater',
};

function getHeatModeLabel(mode: number): string {
  const labels: Record<number, string> = { 0: 'Off', 1: 'Solar', 2: 'Solar Pref', 3: 'Heater' };
  return labels[mode] || 'Unknown';
}

// IntelliBrite colors with command codes
const LIGHT_COLORS = [
  { name: 'White', color: 'rgb(255, 255, 255)', command: 16 },
  { name: 'Blue', color: 'rgb(100, 140, 255)', command: 13 },
  { name: 'Green', color: 'rgb(0, 255, 80)', command: 14 },
  { name: 'Red', color: 'rgb(255, 80, 80)', command: 15 },
  { name: 'Purple', color: 'rgb(180, 100, 255)', command: 17 },
];

// Light show modes
const LIGHT_MODES = [
  { name: 'Party', command: 5 },
  { name: 'Romance', command: 6 },
  { name: 'Caribbean', command: 7 },
  { name: 'American', command: 8 },
  { name: 'Sunset', command: 9 },
  { name: 'Royal', command: 10 },
  { name: 'Swim', command: 4 },
  { name: 'Sync', command: 3 },
];

// Heat mode indicator pill (informational, not clickable)
// Only renders for active heating modes (solar, heater), not for "off"
function HeatModePill({ mode }: { mode: number }) {
  const modeName = HEAT_MODES[mode] || 'off';
  
  // Don't render anything if heat mode is off
  if (modeName === 'off') return null;
  
  const label = getHeatModeLabel(mode);
  
  const pillClass = modeName === 'heater' 
    ? 'heat-pill heater' 
    : 'heat-pill';

  const icon = modeName === 'solar' || modeName === 'solar-preferred' ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  ) : modeName === 'heater' ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5">
      <path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z"/>
    </svg>
  ) : null;

  return (
    <div className={pillClass}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

// Power button - circular with power icon
function PowerButton({ isOn, onToggle }: { isOn: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 ${
        isOn 
          ? 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_16px_rgba(0,210,211,0.3)]' 
          : 'bg-white/10 text-white/40 hover:bg-white/15'
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5">
        <path d="M12 2v10" />
        <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
      </svg>
    </button>
  );
}

function TempRing({ current, setPoint, isActive }: { current: number; setPoint: number; isActive: boolean }) {
  const minTemp = 40;
  const maxTemp = 104;
  const progress = Math.max(0, Math.min(1, (current - minTemp) / (maxTemp - minTemp)));
  const circumference = 2 * Math.PI * 65;
  const offset = circumference * (1 - progress * 0.7);

  return (
    <div className="relative w-[140px] h-[140px]">
      {isActive && (
        <div 
          className="absolute top-1/2 left-1/2 w-[102px] h-[102px] -translate-x-1/2 -translate-y-1/2 rounded-full animate-pulse-glow"
          style={{ background: 'radial-gradient(circle, rgba(0, 210, 211, 0.15) 0%, transparent 70%)' }}
        />
      )}
      <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="tempGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4"/>
            <stop offset="50%" stopColor="#00d2d3"/>
            <stop offset="100%" stopColor="#10b981"/>
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="65" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6"/>
        <circle 
          cx="100" cy="100" r="65" fill="none" stroke="url(#tempGradient)" strokeWidth="6"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ filter: 'drop-shadow(0 0 6px rgba(0, 210, 211, 0.5))', transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="text-[42px] font-light tracking-tight leading-none">
          {current}<sup className="text-[17px] text-white/55 ml-0.5">°</sup>
        </div>
        <div className="text-[13px] text-white/55 mt-1">
          Set to <strong className="text-white/90 font-medium">{setPoint}°</strong>
        </div>
      </div>
    </div>
  );
}

// Format schedule time (minutes from midnight)
function formatScheduleTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function Home() {
  // Start with null - will load from cache in useEffect (avoids hydration mismatch)
  const [status, setStatus] = useState<PoolStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingPhase, setConnectingPhase] = useState<'local' | 'remote'>('local');
  
  // Credentials state
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);
  
  // Schedule data
  const [schedules, setSchedules] = useState<ScheduleEvent[]>([]);
  
  // Track if we've loaded cache to avoid showing loading flash
  const cacheCheckedRef = useRef(false);
  
  // Sheet states
  const [activeSheet, setActiveSheet] = useState<'pool' | 'spa' | 'lights' | null>(null);
  const [tempSetpoint, setTempSetpoint] = useState(86);
  const [heatMode, setHeatMode] = useState(0);
  const [selectedColor, setSelectedColor] = useState(4); // Blue default
  
  // Optimistic UI state - tracks pending changes
  const [optimisticHeatMode, setOptimisticHeatMode] = useState<{ body: 'pool' | 'spa'; mode: number } | null>(null);
  const [optimisticCircuits, setOptimisticCircuits] = useState<Record<number, boolean>>({});
  const pendingRequests = useRef<Set<string>>(new Set());
  const optimisticHeatModeRef = useRef(optimisticHeatMode);
  const optimisticCircuitsRef = useRef(optimisticCircuits);
  const credentialsRef = useRef(credentials);
  const statusRef = useRef(status);
  
  // Keep refs in sync
  useEffect(() => { optimisticHeatModeRef.current = optimisticHeatMode; }, [optimisticHeatMode]);
  useEffect(() => { optimisticCircuitsRef.current = optimisticCircuits; }, [optimisticCircuits]);
  useEffect(() => { credentialsRef.current = credentials; }, [credentials]);
  useEffect(() => { statusRef.current = status; }, [status]);
  
  // Load credentials and cache on mount - useLayoutEffect runs before paint
  useLayoutEffect(() => {
    if (cacheCheckedRef.current) return;
    cacheCheckedRef.current = true;
    
    let stored = loadCredentials();
    
    // Auto-login with demo credentials when NEXT_PUBLIC_DEMO=true and no credentials exist
    if (!stored && process.env.NEXT_PUBLIC_DEMO === 'true') {
      stored = { systemName: 'demo', password: 'demo' };
      // Save demo credentials so other pages can use them
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(stored));
    }
    
    setCredentials(stored);
    setCredentialsLoaded(true);
    
    // Load cached status - show immediately without loading spinner
    const cachedStatus = loadStatusCache();
    if (cachedStatus?.data) {
      setStatus(cachedStatus.data);
      setLoading(false);
    }
    
    // Load cached schedules
    const cachedSchedules = loadSchedulesCache();
    if (cachedSchedules?.data) {
      setSchedules(cachedSchedules.data);
    }
  }, []);

  const fetchStatus = useCallback(async (validateOptimistic = false) => {
    const creds = credentialsRef.current;
    const res = await fetch('/api/status', {
      headers: getAuthHeaders(creds),
    }).catch(() => null);
    
    // Success - got data
    if (res?.ok) {
      const data = await res.json().catch(() => null);
      if (data) {
        setStatus(data);
        setError(null);
        setLoading(false);
        
        // Cache the status for instant load on navigation
        saveStatusCache(data);
        
        // If validating, check if server state matches our optimistic update
        if (validateOptimistic && optimisticHeatModeRef.current) {
          const bodyIndex = optimisticHeatModeRef.current.body === 'pool' ? 0 : 1;
          const serverMode = data.bodies[bodyIndex]?.heatMode;
          if (serverMode === optimisticHeatModeRef.current.mode) {
            setOptimisticHeatMode(null);
          }
        }
        
        // Clear confirmed circuit states
        if (validateOptimistic && Object.keys(optimisticCircuitsRef.current).length > 0) {
          const confirmed: number[] = [];
          for (const [idStr, expectedState] of Object.entries(optimisticCircuitsRef.current)) {
            const id = parseInt(idStr);
            const circuit = data.circuits.find((c: Circuit) => c.id === id);
            if (circuit && circuit.state === expectedState) {
              confirmed.push(id);
            }
          }
          if (confirmed.length > 0) {
            setOptimisticCircuits(prev => {
              const next = { ...prev };
              confirmed.forEach(id => delete next[id]);
              return next;
            });
          }
        }
        return true; // Success
      }
    }
    
    // Failed - but don't show error, just return false
    // If we already have status, keep showing it (stale data is better than no data)
    return false;
  }, []);

  useEffect(() => {
    // Wait for credentials to load from localStorage
    if (!credentialsLoaded) return;
    
    // If no credentials, don't try to connect - show login prompt
    if (!credentials) {
      setLoading(false);
      return;
    }
    
    // If we already have status from cache, don't show connecting animation
    // Just refresh in background
    const hasCache = statusRef.current !== null;
    
    // Show "Connecting locally..." for 1.5s, then "Connecting remotely..." (only if no cache)
    const phaseTimeout = hasCache ? null : setTimeout(() => {
      setConnectingPhase('remote');
    }, 1500);
    
    // Fetch fresh data (silently if we have cache)
    const connect = async () => {
      const success = await fetchStatus();
      if (!success && !hasCache) {
        // Only show error if we don't have cached data to show
        setError('Could not connect to pool');
        setLoading(false);
      }
    };
    
    connect();
    
    // Regular polling once connected (every 30s)
    const interval = setInterval(() => fetchStatus(false), 30000);
    
    // Fetch schedules and pump status (less frequently)
    const fetchExtras = async () => {
      const creds = credentialsRef.current;
      if (!creds) return;
      
      try {
        // Fetch schedules
        const schedulesRes = await fetch('/api/schedules', { headers: getAuthHeaders(creds) });
        if (schedulesRes.ok) {
          const data = await schedulesRes.json();
          const recurring = data.recurring || [];
          setSchedules(recurring);
          saveSchedulesCache(recurring);
        }
      } catch {
        // Silently fail - these are optional enhancements
      }
    };
    
    fetchExtras();
    const extrasInterval = setInterval(fetchExtras, 60000); // Every minute
    
    return () => {
      clearInterval(interval);
      clearInterval(extrasInterval);
      if (phaseTimeout) clearTimeout(phaseTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentialsLoaded, credentials]);
  
  // Get schedule for a specific circuit
  const getCircuitSchedule = (circuitId: number): ScheduleEvent | undefined => {
    return schedules.find(s => s.circuitId === circuitId);
  };

  const pool = status?.bodies.find(b => b.bodyType === 0) || status?.bodies[0];
  const spa = status?.bodies.find(b => b.bodyType === 1) || status?.bodies[1];
  
  // Circuit IDs from your pool config:
  // 1=Spa, 2=Polaris, 3=Jets, 4=Lights, 5=Waterfall Light, 6=Pool, 7=Waterfall, 8=High Speed
  const poolCircuit = status?.circuits.find(c => c.id === 6);
  const spaCircuit = status?.circuits.find(c => c.id === 1);
  const lightsCircuit = status?.circuits.find(c => c.id === 4);
  
  // Helper to get effective circuit state (optimistic or server)
  const getCircuitState = (circuitId: number): boolean => {
    if (circuitId in optimisticCircuits) {
      return optimisticCircuits[circuitId];
    }
    return status?.circuits.find(c => c.id === circuitId)?.state || false;
  };
  
  // Helper to get effective heat mode (optimistic or server)
  const getHeatMode = (body: 'pool' | 'spa'): number => {
    if (optimisticHeatMode && optimisticHeatMode.body === body) {
      return optimisticHeatMode.mode;
    }
    return body === 'pool' ? (pool?.heatMode ?? 0) : (spa?.heatMode ?? 0);
  };

  const toggleCircuit = async (circuitId: number, currentState: boolean) => {
    const newState = !currentState;
    const requestId = `circuit-${circuitId}-${Date.now()}`;
    const isDemo = credentials?.systemName === 'demo';
    
    // Optimistically update UI immediately
    setOptimisticCircuits(prev => ({ ...prev, [circuitId]: newState }));
    pendingRequests.current.add(requestId);
    
    try {
      const res = await fetch(`/api/circuit/${circuitId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getAuthHeaders(credentials),
        },
        body: JSON.stringify({ state: newState }),
      });
      
      if (!res.ok) throw new Error('Failed to toggle circuit');
      
      // In demo mode, just keep the optimistic state (no polling needed)
      if (isDemo) {
        pendingRequests.current.delete(requestId);
        return;
      }
      
      // Poll for confirmation (up to 10 seconds)
      let confirmed = false;
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 2000));
        if (!pendingRequests.current.has(requestId)) break;
        await fetchStatus(true);
        
        const circuit = status?.circuits.find(c => c.id === circuitId);
        if (circuit?.state === newState) {
          confirmed = true;
          break;
        }
      }
      
      if (!confirmed && pendingRequests.current.has(requestId)) {
        // Timeout - clear optimistic state
        setOptimisticCircuits(prev => {
          const next = { ...prev };
          delete next[circuitId];
          return next;
        });
        fetchStatus();
      }
    } catch (err) {
      console.error('Failed to toggle circuit:', err);
      // Rollback on error
      setOptimisticCircuits(prev => {
        const next = { ...prev };
        delete next[circuitId];
        return next;
      });
      fetchStatus();
    } finally {
      pendingRequests.current.delete(requestId);
    }
  };

  // Special handler for Polaris - needs Pool pump + High Speed
  // Circuit IDs: 2=Polaris, 6=Pool, 8=High Speed
  const togglePolaris = async (currentState: boolean) => {
    const newState = !currentState;
    const requestId = `polaris-${Date.now()}`;
    
    // Optimistically update UI for Polaris
    setOptimisticCircuits(prev => ({ ...prev, [2]: newState }));
    pendingRequests.current.add(requestId);
    
    try {
      if (newState) {
        // Turning ON: Pool pump first, then High Speed, then Polaris
        const poolIsOn = getCircuitState(6);
        const highSpeedIsOn = getCircuitState(8);
        
        // Turn on Pool pump if not already on
        if (!poolIsOn) {
          setOptimisticCircuits(prev => ({ ...prev, [6]: true }));
          await fetch('/api/circuit/6', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders(credentials) },
            body: JSON.stringify({ state: true }),
          });
          // Small delay to let pump start
          await new Promise(r => setTimeout(r, 500));
        }
        
        // Turn on High Speed if not already on
        if (!highSpeedIsOn) {
          setOptimisticCircuits(prev => ({ ...prev, [8]: true }));
          await fetch('/api/circuit/8', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders(credentials) },
            body: JSON.stringify({ state: true }),
          });
          await new Promise(r => setTimeout(r, 500));
        }
        
        // Turn on Polaris
        await fetch('/api/circuit/2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders(credentials) },
          body: JSON.stringify({ state: true }),
        });
      } else {
        // Turning OFF: Just turn off Polaris and High Speed (leave pool running)
        setOptimisticCircuits(prev => ({ ...prev, [8]: false }));
        
        // Turn off Polaris
        await fetch('/api/circuit/2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders(credentials) },
          body: JSON.stringify({ state: false }),
        });
        
        // Turn off High Speed
        await fetch('/api/circuit/8', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders(credentials) },
          body: JSON.stringify({ state: false }),
        });
      }
      
      // Poll for confirmation
      await new Promise(r => setTimeout(r, 2000));
      await fetchStatus(true);
      
    } catch (err) {
      console.error('Failed to toggle Polaris:', err);
      // Rollback on error
      setOptimisticCircuits(prev => {
        const next = { ...prev };
        delete next[2];
        delete next[6];
        delete next[8];
        return next;
      });
      fetchStatus();
    } finally {
      pendingRequests.current.delete(requestId);
    }
  };

  const openTempSheet = (body: 'pool' | 'spa') => {
    const data = body === 'pool' ? pool : spa;
    if (data) {
      setTempSetpoint(data.setPoint);
      setHeatMode(data.heatMode);
    }
    setActiveSheet(body);
  };

  const openLightsSheet = () => {
    setActiveSheet('lights');
  };

  const closeSheet = () => {
    setActiveSheet(null);
    setSheetTranslateY(0);
  };

  // Drag to dismiss
  const [sheetTranslateY, setSheetTranslateY] = useState(0);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const target = e.target as HTMLElement;
    // Only allow drag from handle area (top 50px)
    const rect = target.closest('.modal-sheet')?.getBoundingClientRect();
    if (rect && touch.clientY - rect.top < 50) {
      isDragging.current = true;
      dragStartY.current = touch.clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const deltaY = e.touches[0].clientY - dragStartY.current;
    if (deltaY > 0) {
      setSheetTranslateY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (sheetTranslateY > 100) {
      closeSheet();
    } else {
      setSheetTranslateY(0);
    }
  };

  const saveTemperature = async (body: 'pool' | 'spa', temp: number) => {
    try {
      await fetch(`/api/temp/${body}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getAuthHeaders(credentials),
        },
        body: JSON.stringify({ temp }),
      });
      fetchStatus();
    } catch (err) {
      console.error('Failed to set temperature:', err);
    }
  };

  const saveHeatMode = async (body: 'pool' | 'spa', mode: number) => {
    const requestId = `heat-${body}-${Date.now()}`;
    const previousMode = body === 'pool' ? pool?.heatMode : spa?.heatMode;
    
    // Optimistically update UI immediately
    setOptimisticHeatMode({ body, mode });
    setHeatMode(mode);
    pendingRequests.current.add(requestId);
    
    try {
      const res = await fetch(`/api/heat/${body}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getAuthHeaders(credentials),
        },
        body: JSON.stringify({ mode }),
      });
      
      if (!res.ok) throw new Error('Failed to set heat mode');
      
      // Poll for confirmation (up to 10 seconds)
      let confirmed = false;
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 2000));
        if (!pendingRequests.current.has(requestId)) break; // Request was superseded
        await fetchStatus(true);
        
        // Check if server state matches
        const currentBody = body === 'pool' ? status?.bodies[0] : status?.bodies[1];
        if (currentBody?.heatMode === mode) {
          confirmed = true;
          break;
        }
      }
      
      if (!confirmed && pendingRequests.current.has(requestId)) {
        // Timeout - clear optimistic state, let server state take over
        setOptimisticHeatMode(null);
        fetchStatus();
      }
    } catch (err) {
      console.error('Failed to set heat mode:', err);
      // Rollback on error
      setOptimisticHeatMode(null);
      setHeatMode(previousMode ?? 0);
      fetchStatus();
    } finally {
      pendingRequests.current.delete(requestId);
    }
  };

  const formatLastUpdated = (iso: string) => {
    const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diffSec < 10) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <>
      <div className="relative z-10 max-w-[430px] mx-auto px-4 pt-3 pb-24 min-h-dvh">
        {/* Header */}
        <header className="flex justify-between items-start py-2 animate-fade-in">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <img src="/logo-192.png" alt="Plunge" className="w-8 h-8 -ml-[5px]" />
              <h1 className="text-[32px] font-semibold tracking-tight leading-none">Plunge</h1>
            </div>
            <div className="flex items-center gap-2 text-[15px] text-white/55 ml-[7px]">
              {loading && !status ? (
                <span>{connectingPhase === 'local' ? 'Connecting locally...' : 'Connecting remotely...'}</span>
              ) : error && !status ? (
                <span className="text-red-400">Offline</span>
              ) : (
                <>
                  <span className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(48,209,88,0.6)] ${status?.connectionType === 'local' ? 'bg-cyan-400' : status?.connectionType === 'demo' ? 'bg-purple-400' : 'bg-green-500'}`} />
                  <span>{status?.connectionType === 'local' ? 'Local' : status?.connectionType === 'demo' ? 'Demo' : 'Remote'}</span>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[13px] text-white/35 leading-none mb-0.5">Outside</div>
            <div className="text-[20px] font-medium text-white/55">{status?.airTemp || '--'}°</div>
          </div>
        </header>

        {!credentialsLoaded ? (
          <div className="flex-1 flex items-center justify-center pt-32">
            <div className="text-white/40">Loading...</div>
          </div>
        ) : !credentials ? (
          <div className="flex-1 flex flex-col items-center justify-center pt-32 gap-4">
            <div className="text-white/40 text-center px-8">
              <div className="text-[18px] mb-2">Welcome to Plunge</div>
              <div className="text-[14px]">Add your pool credentials to get started</div>
            </div>
            <a 
              href="/settings"
              className="px-6 py-3 bg-cyan-500 rounded-xl text-black font-semibold active:opacity-80"
            >
              Setup Pool
            </a>
          </div>
        ) : loading ? (
          <div className="flex-1 flex flex-col items-center justify-center pt-32 gap-6">
            {/* Liquid Glass Loading Animation */}
            <div className="relative">
              {/* Outer ring */}
              <div className="w-24 h-24 rounded-full border border-white/10 animate-pulse" />
              
              {/* Spinning gradient ring */}
              <div 
                className="absolute inset-0 rounded-full animate-spin"
                style={{
                  background: 'conic-gradient(from 0deg, transparent, rgba(0, 210, 211, 0.4), transparent)',
                  animationDuration: '2s',
                }}
              />
              
              {/* Inner glass circle */}
              <div 
                className="absolute inset-2 rounded-full backdrop-blur-xl"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  boxShadow: 'inset 0 0 20px rgba(0, 210, 211, 0.1)',
                }}
              />
              
              {/* Center glow */}
              <div 
                className="absolute inset-4 rounded-full animate-pulse"
                style={{
                  background: 'radial-gradient(circle, rgba(0, 210, 211, 0.3) 0%, transparent 70%)',
                  animationDuration: '1.5s',
                }}
              />
              
              {/* Water wave icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <svg 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="1.5" 
                  className="w-8 h-8 text-cyan-400/60"
                >
                  <path d="M2 12c2-2 4-3 6-3s4 1 6 3 4 3 6 3 4-1 6-3" />
                  <path d="M2 18c2-2 4-3 6-3s4 1 6 3 4 3 6 3 4-1 6-3" />
                </svg>
              </div>
            </div>
            
            <div className="text-white/40 text-[14px]">
              {connectingPhase === 'local' ? 'Connecting locally...' : 'Connecting remotely...'}
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center pt-32 gap-4">
            <div className="text-white/40">Could not connect to pool</div>
            <button 
              onClick={async () => {
                setError(null);
                setLoading(true);
                setConnectingPhase('local');
                setTimeout(() => setConnectingPhase('remote'), 1500);
                
                const success = await fetchStatus();
                if (!success) {
                  setError('Could not connect to pool');
                  setLoading(false);
                }
              }} 
              className="px-4 py-2 bg-white/10 rounded-lg text-white/70 active:bg-white/20"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Freeze Protection Alert */}
            {status?.freezeMode && (
              <div className="liquid-glass p-3 mb-3 border border-blue-400/40 animate-slide-up">
                <div className="flex items-center gap-3 relative z-10">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-blue-400">
                      <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[14px] font-medium text-blue-400">Freeze Protection Active</div>
                    <div className="text-[12px] text-white/50">Pump running to prevent freezing</div>
                  </div>
                </div>
              </div>
            )}

            {/* Pool Card */}
            {pool && (
              <div
                onClick={() => openTempSheet('pool')}
                className={`liquid-glass p-3.5 mb-2.5 cursor-pointer animate-slide-up ${getCircuitState(6) ? 'tint-cyan' : ''}`}
              >
                <div className="flex justify-between items-center mb-2 relative z-10">
                  <div className="flex items-center gap-3">
                    <span className="text-[17px] font-semibold">{pool.name || 'Pool'}</span>
                    {/* Heat mode indicator (only show when pump is on) */}
                    {getCircuitState(6) && (
                      <HeatModePill mode={getHeatMode('pool')} />
                    )}
                  </div>
                  <PowerButton 
                    isOn={getCircuitState(6)} 
                    onToggle={() => toggleCircuit(6, getCircuitState(6))} 
                  />
                </div>
                <div className="flex flex-col items-center py-1 relative z-10">
                  <TempRing current={pool.currentTemp} setPoint={pool.setPoint} isActive={getCircuitState(6)} />
                </div>
                {/* Schedule indicator */}
                {(() => {
                  const schedule = getCircuitSchedule(6);
                  if (schedule) {
                    return (
                      <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-white/40 relative z-10">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span>{formatScheduleTime(schedule.startTime)} - {formatScheduleTime(schedule.stopTime)}</span>
                      </div>
                    );
                  }
                  return <div className="text-[11px] text-white/35 mt-1.5 relative z-10">Tap to adjust</div>;
                })()}
              </div>
            )}

            {/* Spa Card */}
            {spa && (
              <div
                onClick={() => openTempSheet('spa')}
                className={`liquid-glass p-3.5 mb-2.5 cursor-pointer animate-slide-up ${getCircuitState(1) ? 'tint-cyan' : ''}`}
              >
                <div className="flex justify-between items-center mb-2 relative z-10">
                  <div className="flex items-center gap-3">
                    <span className="text-[17px] font-semibold">{spa.name || 'Spa'}</span>
                    {/* Heat mode indicator (only show when spa is on) */}
                    {getCircuitState(1) && (
                      <HeatModePill mode={getHeatMode('spa')} />
                    )}
                  </div>
                  <PowerButton 
                    isOn={getCircuitState(1)} 
                    onToggle={() => toggleCircuit(1, getCircuitState(1))} 
                  />
                </div>
                <div className="flex flex-col items-center py-1 relative z-10">
                  <TempRing current={spa.currentTemp} setPoint={spa.setPoint} isActive={getCircuitState(1)} />
                </div>
                {/* Schedule indicator */}
                {(() => {
                  const schedule = getCircuitSchedule(1);
                  if (schedule) {
                    return (
                      <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-white/40 relative z-10">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span>{formatScheduleTime(schedule.startTime)} - {formatScheduleTime(schedule.stopTime)}</span>
                      </div>
                    );
                  }
                  return <div className="text-[11px] text-white/35 mt-1.5 relative z-10">Tap to adjust</div>;
                })()}
              </div>
            )}

            {/* Quick Actions - Other circuits */}
            <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mt-4 mb-3">Quick Actions</h2>
            <div className="grid grid-cols-4 gap-2.5">
              {/* Lights */}
              {(() => {
                const isOn = getCircuitState(4);
                return (
                  <button
                    onClick={openLightsSheet}
                    className={`liquid-glass p-3 flex flex-col items-center gap-1.5 ${isOn ? 'tint-cyan' : ''}`}
                  >
                    <svg className={`w-6 h-6 ${isOn ? 'text-[#00d2d3] drop-shadow-[0_0_8px_rgba(0,210,211,0.7)]' : 'text-white/35'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M9 18h6M10 22h4M12 2v2"/><path d="M12 8c-2.2 0-4 1.8-4 4v4h8v-4c0-2.2-1.8-4-4-4z"/>
                      <path d="M4 12h2M18 12h2M6.34 6.34l1.42 1.42M16.24 6.34l-1.42 1.42"/>
                    </svg>
                    <span className={`text-[11px] font-medium ${isOn ? 'text-white' : 'text-white/55'}`}>Lights</span>
                  </button>
                );
              })()}

              {/* Jets - Circuit 3 */}
              {(() => {
                const isOn = getCircuitState(3);
                return (
                  <button
                    onClick={() => toggleCircuit(3, isOn)}
                    className={`liquid-glass p-3 flex flex-col items-center gap-1.5 ${isOn ? 'tint-cyan' : ''}`}
                  >
                    <svg className={`w-6 h-6 ${isOn ? 'text-[#00d2d3] drop-shadow-[0_0_8px_rgba(0,210,211,0.7)]' : 'text-white/35'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      {/* Bubbles/jets icon */}
                      <circle cx="12" cy="6" r="2"/><circle cx="7" cy="11" r="2"/><circle cx="17" cy="11" r="2"/>
                      <circle cx="9" cy="17" r="2"/><circle cx="15" cy="17" r="2"/>
                    </svg>
                    <span className={`text-[11px] font-medium ${isOn ? 'text-white' : 'text-white/55'}`}>Jets</span>
                  </button>
                );
              })()}

              {/* Waterfall - Circuit 7 */}
              {(() => {
                const isOn = getCircuitState(7);
                return (
                  <button
                    onClick={() => toggleCircuit(7, isOn)}
                    className={`liquid-glass p-3 flex flex-col items-center gap-1.5 ${isOn ? 'tint-cyan' : ''}`}
                  >
                    <svg className={`w-6 h-6 ${isOn ? 'text-[#00d2d3] drop-shadow-[0_0_8px_rgba(0,210,211,0.7)]' : 'text-white/35'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      {/* Waterfall - wavy lines falling */}
                      <path d="M4 4h16"/>
                      <path d="M7 4c0 4-2 6-2 10s2 6 2 6"/>
                      <path d="M12 4c0 4-2 6-2 10s2 6 2 6"/>
                      <path d="M17 4c0 4-2 6-2 10s2 6 2 6"/>
                    </svg>
                    <span className={`text-[11px] font-medium ${isOn ? 'text-white' : 'text-white/55'}`}>Waterfall</span>
                  </button>
                );
              })()}

              {/* Polaris - Circuit 2 (also controls High Speed circuit 8) */}
              {(() => {
                const isOn = getCircuitState(2);
                return (
                  <button
                    onClick={() => togglePolaris(isOn)}
                    className={`liquid-glass p-3 flex flex-col items-center gap-1.5 ${isOn ? 'tint-cyan' : ''}`}
                  >
                    <svg className={`w-6 h-6 ${isOn ? 'text-[#00d2d3] drop-shadow-[0_0_8px_rgba(0,210,211,0.7)]' : 'text-white/35'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="8"/><path d="M12 8v8"/><path d="M8 12h8"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    <span className={`text-[11px] font-medium ${isOn ? 'text-white' : 'text-white/55'}`}>Polaris</span>
                  </button>
                );
              })()}
            </div>


            {status?.lastUpdated && (
              <div className="text-center text-[12px] text-white/30 mt-4">Updated {formatLastUpdated(status.lastUpdated)}</div>
            )}
          </>
        )}
      </div>

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <button className="nav-item active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </button>
        <a href="/schedules" className="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Schedules</span>
        </a>
        <a href="/history" className="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-6"/></svg>
          <span>History</span>
        </a>
        <a href="/settings" className="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>Settings</span>
        </a>
      </nav>

      {/* Modal Backdrop */}
      <div className={`modal-backdrop ${activeSheet ? 'open' : ''}`} onClick={closeSheet} />

      {/* Temperature Sheet */}
      <div 
        className={`modal-sheet ${activeSheet === 'pool' || activeSheet === 'spa' ? 'open' : ''}`}
        style={{ transform: sheetTranslateY > 0 && (activeSheet === 'pool' || activeSheet === 'spa') ? `translateY(${sheetTranslateY}px)` : undefined }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="w-9 h-1.5 bg-white/30 rounded-full mx-auto mt-2 cursor-grab" />
        <div className="flex justify-between items-center px-5 py-4">
          <span className="text-[20px] font-semibold">{activeSheet === 'pool' ? 'Pool' : 'Spa'}</span>
          <button onClick={closeSheet} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-white/60">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <div className="px-5 pb-8">
          {/* On/Off Toggle */}
          {(() => {
            const circuitId = activeSheet === 'pool' ? 6 : 1;
            const isOn = getCircuitState(circuitId);
            return (
              <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl mb-4">
                <div>
                  <div className="text-[16px] font-medium">{activeSheet === 'pool' ? 'Pool Pump' : 'Spa Mode'}</div>
                  <div className="text-[14px] text-white/35">{isOn ? 'Running' : 'Off'}</div>
                </div>
                <button 
                  onClick={() => toggleCircuit(circuitId, isOn)}
                  className={`w-[51px] h-[31px] rounded-full relative transition-colors ${isOn ? 'bg-green-500' : 'bg-white/15'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-[27px] h-[27px] bg-white rounded-full shadow transition-transform ${isOn ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            );
          })()}

          {/* Current temp */}
          <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl mb-6">
            <span className="text-[14px] text-white/55">Current Temperature</span>
            <span className="text-[17px] font-medium">
              {activeSheet === 'pool' ? pool?.currentTemp : spa?.currentTemp}°
            </span>
          </div>

          {/* Setpoint adjuster */}
          <div className="flex flex-col items-center py-6">
            <div className="flex items-center gap-8">
              <button 
                onClick={() => {
                  const newTemp = Math.max(40, tempSetpoint - 1);
                  setTempSetpoint(newTemp);
                  if (activeSheet) saveTemperature(activeSheet as 'pool' | 'spa', newTemp);
                }}
                className="w-14 h-14 bg-white/8 border border-white/15 rounded-full flex items-center justify-center active:scale-95 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M5 12h14"/></svg>
              </button>
              <div className="text-[72px] font-light tracking-tight min-w-[140px] text-center">
                {tempSetpoint}<sup className="text-[28px] text-white/55">°</sup>
              </div>
              <button 
                onClick={() => {
                  const newTemp = Math.min(104, tempSetpoint + 1);
                  setTempSetpoint(newTemp);
                  if (activeSheet) saveTemperature(activeSheet as 'pool' | 'spa', newTemp);
                }}
                className="w-14 h-14 bg-white/8 border border-white/15 rounded-full flex items-center justify-center active:scale-95 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            </div>
            <div className="text-[14px] text-white/35 mt-2">Range: 40° – 104°F</div>
          </div>

          {/* Heat mode */}
          <div className="mt-6">
            <div className="text-[13px] font-semibold text-white/35 uppercase tracking-wider mb-3">Heat Mode</div>
            <div className="flex bg-white/5 rounded-xl p-1 gap-1">
              {/* Pool has: Off, Solar, Heater. Spa has: Off, Heater (no solar) */}
              {[
                { mode: 0, label: 'Off', icon: null, showFor: ['pool', 'spa'] },
                { mode: 1, label: 'Solar', icon: 'sun', showFor: ['pool'] },
                { mode: 3, label: 'Heater', icon: 'flame', showFor: ['pool', 'spa'] },
              ]
                .filter(({ showFor }) => activeSheet && showFor.includes(activeSheet))
                .map(({ mode, label, icon }) => (
                <button
                  key={mode}
                  onClick={() => {
                    setHeatMode(mode);
                    if (activeSheet && activeSheet !== 'lights') {
                      saveHeatMode(activeSheet, mode);
                    }
                  }}
                  className={`flex-1 py-3 px-4 rounded-lg text-[15px] font-medium flex items-center justify-center gap-1.5 transition
                    ${heatMode === mode 
                      ? mode === 1 ? 'bg-orange-500/20 text-orange-400' 
                        : mode === 3 ? 'bg-red-500/20 text-red-400' 
                        : 'bg-white/10 text-white' 
                      : 'text-white/55'}`}
                >
                  {icon === 'sun' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>}
                  {icon === 'flame' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z"/></svg>}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Egg Timer / Run For */}
          <div className="mt-6">
            <div className="text-[13px] font-semibold text-white/35 uppercase tracking-wider mb-3">Run For</div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { minutes: 30, label: '30m' },
                { minutes: 60, label: '1h' },
                { minutes: 120, label: '2h' },
                { minutes: 240, label: '4h' },
              ].map(({ minutes, label }) => (
                <button
                  key={minutes}
                  onClick={async () => {
                    const circuitId = activeSheet === 'pool' ? 6 : 1;
                    // First turn on the circuit if not already on
                    if (!getCircuitState(circuitId)) {
                      await toggleCircuit(circuitId, false);
                    }
                    // Then set the runtime
                    try {
                      await fetch('/api/circuit-runtime', {
                        method: 'POST',
                        headers: { 
                          'Content-Type': 'application/json',
                          ...getAuthHeaders(credentials),
                        },
                        body: JSON.stringify({ circuitId, minutes }),
                      });
                      closeSheet();
                    } catch {
                      // Ignore errors
                    }
                  }}
                  className="py-3 px-2 bg-white/5 hover:bg-white/10 rounded-xl text-[14px] font-medium text-white/70 transition-colors active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-white/40">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {label}
                </button>
              ))}
            </div>
            <div className="text-[12px] text-white/35 mt-2 text-center">Auto-off after selected time</div>
          </div>
        </div>
      </div>

      {/* Lights Sheet */}
      <div 
        className={`modal-sheet ${activeSheet === 'lights' ? 'open' : ''}`}
        style={{ transform: sheetTranslateY > 0 && activeSheet === 'lights' ? `translateY(${sheetTranslateY}px)` : undefined }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="w-9 h-1.5 bg-white/30 rounded-full mx-auto mt-2 cursor-grab" />
        <div className="flex justify-between items-center px-5 py-4">
          <span className="text-[20px] font-semibold">Lights</span>
          <button onClick={closeSheet} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-white/60">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <div className="px-5 pb-8">
          {/* Individual Light Toggles */}
          <div className="text-[13px] font-semibold text-white/35 uppercase tracking-wider mb-3">Lights</div>
          <div className="bg-white/5 rounded-xl overflow-hidden mb-6">
            {/* Pool Lights - Circuit 4 */}
            {(() => {
              const isOn = getCircuitState(4);
              const colorName = selectedColor >= 0 ? LIGHT_COLORS[selectedColor]?.name : 'Show';
              return (
                <div className="flex justify-between items-center p-4 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    {isOn && selectedColor >= 0 && (
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ background: LIGHT_COLORS[selectedColor]?.color, boxShadow: `0 0 8px ${LIGHT_COLORS[selectedColor]?.color}` }} 
                      />
                    )}
                    <div>
                      <div className="text-[16px] font-medium">Pool</div>
                      <div className="text-[14px] text-white/35">{isOn ? colorName : 'Off'}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleCircuit(4, isOn)}
                    className={`w-[51px] h-[31px] rounded-full relative transition-colors ${isOn ? 'bg-green-500' : 'bg-white/15'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-[27px] h-[27px] bg-white rounded-full shadow transition-transform ${isOn ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              );
            })()}
            {/* Waterfall Light - Circuit 5 */}
            {(() => {
              const isOn = getCircuitState(5);
              const colorName = selectedColor >= 0 ? LIGHT_COLORS[selectedColor]?.name : 'Show';
              return (
                <div className="flex justify-between items-center p-4">
                  <div className="flex items-center gap-3">
                    {isOn && selectedColor >= 0 && (
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ background: LIGHT_COLORS[selectedColor]?.color, boxShadow: `0 0 8px ${LIGHT_COLORS[selectedColor]?.color}` }} 
                      />
                    )}
                    <div>
                      <div className="text-[16px] font-medium">Waterfall</div>
                      <div className="text-[14px] text-white/35">{isOn ? colorName : 'Off'}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleCircuit(5, isOn)}
                    className={`w-[51px] h-[31px] rounded-full relative transition-colors ${isOn ? 'bg-green-500' : 'bg-white/15'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-[27px] h-[27px] bg-white rounded-full shadow transition-transform ${isOn ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              );
            })()}
          </div>

          {/* All Lights Toggle */}
          {(() => {
            const poolOn = getCircuitState(4);
            const waterfallOn = getCircuitState(5);
            const allOn = poolOn && waterfallOn;
            const anyOn = poolOn || waterfallOn;
            return (
              <button
                onClick={async () => {
                  const newState = !allOn;
                  // Toggle both lights together
                  if (getCircuitState(4) !== newState) toggleCircuit(4, getCircuitState(4));
                  if (getCircuitState(5) !== newState) toggleCircuit(5, getCircuitState(5));
                }}
                className={`w-full p-4 rounded-xl mb-6 font-semibold transition-colors ${
                  allOn ? 'bg-cyan-500 text-black' : anyOn ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'
                }`}
              >
                {allOn ? 'All Lights On' : anyOn ? 'Turn All On' : 'Turn All On'}
              </button>
            );
          })()}

          {/* Colors */}
          <div className={`transition-opacity ${(getCircuitState(4) || getCircuitState(5)) ? '' : 'opacity-40 pointer-events-none'}`}>
            <div className="text-[13px] font-semibold text-white/35 uppercase tracking-wider mb-3">Color</div>
            <div className="grid grid-cols-5 gap-3 mb-6">
              {LIGHT_COLORS.map((c, i) => (
                <button
                  key={c.name}
                  onClick={async () => {
                    // Optimistic update
                    setSelectedColor(i);
                    // Send command
                    try {
                      await fetch('/api/lights', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          ...getAuthHeaders(credentials),
                        },
                        body: JSON.stringify({ command: c.command }),
                      });
                    } catch (err) {
                      console.error('Failed to set light color:', err);
                    }
                  }}
                  className={`aspect-square rounded-2xl flex items-end justify-center pb-2 transition-all
                    ${selectedColor === i ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-105' : ''}`}
                  style={{
                    background: c.color,
                    boxShadow: selectedColor === i ? `0 4px 20px ${c.color}` : '0 2px 8px rgba(0,0,0,0.3)'
                  }}
                >
                  <span className={`text-[10px] font-semibold uppercase tracking-wide
                    ${['White'].includes(c.name) ? 'text-black/60' : 'text-white/90'}`}>
                    {c.name}
                  </span>
                </button>
              ))}
            </div>

            {/* Light Modes */}
            <div className="text-[13px] font-semibold text-white/35 uppercase tracking-wider mb-3">Shows</div>
            <div className="grid grid-cols-4 gap-2">
              {LIGHT_MODES.map((m) => (
                <button
                  key={m.name}
                  onClick={async () => {
                    setSelectedColor(-1); // Deselect solid color
                    try {
                      await fetch('/api/lights', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          ...getAuthHeaders(credentials),
                        },
                        body: JSON.stringify({ command: m.command }),
                      });
                    } catch (err) {
                      console.error('Failed to set light mode:', err);
                    }
                  }}
                  className="py-2.5 px-2 bg-white/10 rounded-xl text-[12px] font-medium active:bg-white/20 transition-colors"
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

    </>
  );
}
