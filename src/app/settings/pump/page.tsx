'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { loadCache, saveCache, isCacheStale } from '@/lib/settings-cache';

interface PumpCircuit {
  circuitId: number;
  speed: number;
  isRPM: boolean;
}

interface PumpConfig {
  pumpId: number;
  pumpType: number;
  pumpName?: string;
  isRunning: boolean;
  watts: number;
  rpm: number;
  gpm: number;
  pumpCircuits: PumpCircuit[];
  primingSpeed: number;
  primingTime: number;
  minSpeed?: number;
  maxSpeed?: number;
}

interface EquipmentPump {
  id: number;
  type: number;
  pentairType: number;
  name: string;
  circuits: { id: number; circuit: number; speed: number; units: number }[];
  primingSpeed: number;
  primingTime: number;
  minSpeed: number;
  maxSpeed: number;
}

interface CircuitDefinition {
  circuitId: number;
  name: string;
}

interface Credentials {
  systemName: string;
  password: string;
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

// Pump type names
const PUMP_TYPES: Record<number, string> = {
  0: 'None',
  1: 'IntelliFlo VF',
  2: 'IntelliFlo VS',
  3: 'IntelliFlo VSF',
  4: 'IntelliFlo VS+SVRS',
  5: 'IntelliFlo VF+SVRS',
};

interface DelayStatus {
  poolDelay: boolean;
  spaDelay: boolean;
  cleanerDelay: boolean;
}

export default function PumpSettingsPage() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [pump, setPump] = useState<PumpConfig | null>(null);
  const [circuits, setCircuits] = useState<CircuitDefinition[]>([]);
  const [delayStatus, setDelayStatus] = useState<DelayStatus | null>(null);
  const [highSpeedOn, setHighSpeedOn] = useState(false);
  const [togglingHighSpeed, setTogglingHighSpeed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Editor state
  const [editingCircuit, setEditingCircuit] = useState<PumpCircuit | null>(null);
  const [formSpeed, setFormSpeed] = useState(1000);
  const [saving, setSaving] = useState(false);
  
  // Drag to dismiss
  const [sheetTranslateY, setSheetTranslateY] = useState(0);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const target = e.target as HTMLElement;
    const rect = target.closest('.modal-sheet')?.getBoundingClientRect();
    if (rect && touch.clientY - rect.top < 50) {
      isDragging.current = true;
      dragStartY.current = touch.clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const touch = e.touches[0];
    const delta = touch.clientY - dragStartY.current;
    if (delta > 0) {
      setSheetTranslateY(delta);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (sheetTranslateY > 100) {
      closeSpeedEditor();
    }
    setSheetTranslateY(0);
  };

  useEffect(() => {
    setCredentials(loadCredentials());
    
    // Load cached data immediately
    const cache = loadCache();
    if (cache) {
      if (cache.pump) {
        setPump(cache.pump as PumpConfig);
      }
      if (cache.config) {
        const config = cache.config as { controller?: { circuitArray?: CircuitDefinition[] } };
        setCircuits(config.controller?.circuitArray || []);
      }
      if (!isCacheStale()) {
        setLoading(false);
      }
    }
  }, []);

  const fetchData = useCallback(async (showLoading = true) => {
    if (!credentials) return;
    
    if (showLoading) setLoading(true);
    try {
      // Fetch config - equipment config has reliable pump data
      const configRes = await fetch('/api/config', { headers: getAuthHeaders(credentials) });
      
      let configData = null;
      let pumpData: PumpConfig | null = null;
      
      if (configRes.ok) {
        configData = await configRes.json();
        setCircuits(configData.controller.circuitArray || []);
        
        // Extract pump info from equipment config - this is the reliable source
        const equipPumps = configData.equipment?.pumps as EquipmentPump[] | undefined;
        if (equipPumps && equipPumps.length > 0) {
          // Find the first configured pump (usually id 1)
          const equipPump = equipPumps[0];
          if (equipPump && equipPump.pentairType > 0) {
            pumpData = {
              pumpId: equipPump.id,
              pumpType: equipPump.pentairType,
              pumpName: equipPump.name,
              isRunning: false, // Will be updated from status if available
              watts: 0,
              rpm: 0,
              gpm: 0,
              pumpCircuits: equipPump.circuits
                .filter(c => c.circuit > 0)
                .map(c => ({
                  circuitId: c.circuit,
                  speed: c.speed,
                  isRPM: c.units === 0, // units 0 = RPM, 1 = GPM
                })),
              primingSpeed: equipPump.primingSpeed,
              primingTime: equipPump.primingTime,
              minSpeed: equipPump.minSpeed,
              maxSpeed: equipPump.maxSpeed,
            };
          }
        }
      }
      
      // Try to get live pump status (may timeout) to get running state
      try {
        // Use the pump ID from equipment config, or try 1 (common default)
        const pumpId = pumpData?.pumpId ?? 1;
        const pumpRes = await fetch(`/api/config/pump/${pumpId}`, { headers: getAuthHeaders(credentials) });
        if (pumpRes.ok) {
          const liveStatus = await pumpRes.json();
          // Merge live status with config data
          if (pumpData) {
            pumpData = {
              ...pumpData,
              isRunning: liveStatus.isRunning,
              watts: liveStatus.watts,
              rpm: liveStatus.rpm,
              gpm: liveStatus.gpm,
            };
          } else {
            pumpData = liveStatus;
          }
        }
      } catch {
        // Pump status fetch failed, but we still have config data
      }
      
      // Fetch pool status to get delay info and circuit states
      try {
        const statusRes = await fetch('/api/status', { headers: getAuthHeaders(credentials) });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setDelayStatus({
            poolDelay: statusData.poolDelay || false,
            spaDelay: statusData.spaDelay || false,
            cleanerDelay: statusData.cleanerDelay || false,
          });
          // Check High Speed circuit state (circuit 8)
          const highSpeedCircuit = statusData.circuits?.find((c: { id: number }) => c.id === 8);
          setHighSpeedOn(highSpeedCircuit?.state === 1);
        }
      } catch {
        // Status fetch failed, continue without delay info
      }
      
      // Set pump state and update cache
      setPump(pumpData);
      saveCache({ config: configData, pump: pumpData });
      
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [credentials]);

  useEffect(() => {
    if (credentials) {
      const cache = loadCache();
      const hasCache = cache && (cache.pump || cache.config);
      fetchData(!hasCache || isCacheStale());
    }
  }, [credentials, fetchData]);

  const getCircuitName = (circuitId: number): string => {
    const circuit = circuits.find(c => c.circuitId === circuitId);
    return circuit?.name || `Circuit ${circuitId}`;
  };

  const getPumpTypeName = (): string => {
    // Use the pump name from equipment config if available
    if (pump?.pumpName) return pump.pumpName;
    return PUMP_TYPES[pump?.pumpType ?? 0] || `Type ${pump?.pumpType}`;
  };

  const toggleHighSpeed = async () => {
    // Only allow toggle when pump is running
    if (!credentials || togglingHighSpeed || !pump?.isRunning) return;
    
    const newState = !highSpeedOn;
    setTogglingHighSpeed(true);
    setHighSpeedOn(newState); // Optimistic update
    
    try {
      const res = await fetch('/api/circuit/8', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(credentials),
        },
        body: JSON.stringify({ state: newState }),
      });
      
      if (!res.ok) {
        setHighSpeedOn(!newState);
      } else {
        setTimeout(() => fetchData(false), 2000);
      }
    } catch {
      // Revert on error
      setHighSpeedOn(!newState);
    } finally {
      setTogglingHighSpeed(false);
    }
  };

  const openSpeedEditor = (pumpCircuit: PumpCircuit) => {
    setEditingCircuit(pumpCircuit);
    setFormSpeed(pumpCircuit.speed);
  };

  const closeSpeedEditor = () => {
    setEditingCircuit(null);
  };

  const saveSpeed = async () => {
    if (!credentials || !pump || !editingCircuit) return;
    
    setSaving(true);
    try {
      await fetch(`/api/config/pump/${pump.pumpId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(credentials) },
        body: JSON.stringify({
          circuitId: editingCircuit.circuitId,
          speed: formSpeed,
          isRPM: editingCircuit.isRPM,
        }),
      });
      closeSpeedEditor();
      fetchData();
    } catch (err) {
      console.error('Failed to save pump speed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="relative z-10 max-w-[430px] mx-auto px-4 pt-3 pb-24 min-h-dvh">
        {/* Header */}
        <header className="flex items-center gap-3 py-2 mb-4">
          <Link href="/settings" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </Link>
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight leading-none">Pump</h1>
            <p className="text-[14px] text-white/50 mt-0.5">Configuration & Status</p>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center pt-32">
            <div className="text-white/40">Loading pump data...</div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center pt-32 gap-4">
            <div className="text-white/40">{error}</div>
            <button onClick={() => fetchData()} className="px-4 py-2 bg-white/10 rounded-lg text-white/70">
              Retry
            </button>
          </div>
        ) : !pump ? (
          <div className="flex items-center justify-center pt-32">
            <div className="text-white/40">No pump configured</div>
          </div>
        ) : (
          <>
            {/* Current Status */}
            <section className="mb-6">
              <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">Current Status</h2>
              <div className="bg-white/5 rounded-xl overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b border-white/5">
                  <span className="text-[14px] text-white/55">Type</span>
                  <span className="text-[14px] font-medium">{getPumpTypeName()}</span>
                </div>
                <div className="flex justify-between items-center p-4 border-b border-white/5">
                  <span className="text-[14px] text-white/55">Status</span>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${pump.isRunning ? 'bg-green-500' : 'bg-white/30'}`} />
                    <span className="text-[14px] font-medium">{pump.isRunning ? 'Running' : 'Off'}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 divide-x divide-white/5">
                  <div className="p-4 text-center">
                    <div className="text-[24px] font-light">{pump.rpm}</div>
                    <div className="text-[12px] text-white/40">RPM</div>
                  </div>
                  <div className="p-4 text-center">
                    <div className="text-[24px] font-light">{pump.watts}</div>
                    <div className="text-[12px] text-white/40">Watts</div>
                  </div>
                  <div className="p-4 text-center">
                    <div className="text-[24px] font-light">{pump.gpm}</div>
                    <div className="text-[12px] text-white/40">GPM</div>
                  </div>
                </div>
                {/* Cancel Delay button - only show when there's an active delay */}
                {(delayStatus?.poolDelay || delayStatus?.spaDelay || delayStatus?.cleanerDelay) && (
                  <div className="p-4 border-t border-white/5">
                    <button
                      onClick={async () => {
                        try {
                          await fetch('/api/delay', {
                            method: 'DELETE',
                            headers: getAuthHeaders(credentials),
                          });
                          // Refresh status after a moment
                          setTimeout(() => fetchData(), 2000);
                        } catch {
                          // Ignore errors
                        }
                      }}
                      className="w-full py-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg text-[14px] font-medium transition-colors active:scale-[0.98]"
                    >
                      Cancel Delay
                    </button>
                    <p className="text-[11px] text-white/30 text-center mt-2">
                      Skip the cool-down delay and stop pump immediately
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* High Speed Control */}
            <section className="mb-6">
              <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">Manual Override</h2>
              <div className="bg-white/5 rounded-xl overflow-hidden">
                <div className="flex justify-between items-center p-4">
                  <div>
                    <div className={`text-[16px] font-medium ${!pump.isRunning ? 'text-white/40' : ''}`}>High Speed</div>
                    <div className="text-[12px] text-white/40">2850 RPM • Circuit 8</div>
                  </div>
                  <button
                    onClick={toggleHighSpeed}
                    disabled={togglingHighSpeed || !pump.isRunning}
                    className={`relative w-[52px] h-[32px] rounded-full transition-colors ${
                      highSpeedOn ? 'bg-[#00d2d3]' : 'bg-white/20'
                    } ${(togglingHighSpeed || !pump.isRunning) ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div
                      className={`absolute top-[3px] w-[26px] h-[26px] rounded-full bg-white shadow-md transition-transform ${
                        highSpeedOn ? 'translate-x-[23px]' : 'translate-x-[3px]'
                      }`}
                    />
                  </button>
                </div>
                <div className="px-4 pb-4">
                  <p className="text-[11px] text-white/30">
                    {pump.isRunning 
                      ? 'Manually run pump at high speed. Used for cleaning and circulation boost.'
                      : 'Start the pump first to enable high speed mode.'}
                  </p>
                </div>
              </div>
            </section>

            {/* Circuit Speeds */}
            <section className="mb-6">
              <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">Circuit Speeds</h2>
              <p className="text-[12px] text-white/30 mb-3">Speed the pump runs at for each circuit</p>
              <div className="bg-white/5 rounded-xl overflow-hidden">
                {pump.pumpCircuits.length === 0 ? (
                  <div className="p-4 text-center text-white/40 text-[14px]">
                    No circuit speeds configured
                  </div>
                ) : (
                  pump.pumpCircuits.map((pc) => (
                    <button
                      key={pc.circuitId}
                      onClick={() => openSpeedEditor(pc)}
                      className="w-full flex justify-between items-center p-4 border-b border-white/5 last:border-0 active:bg-white/5 text-left"
                    >
                      <span className="text-[16px] font-medium">{getCircuitName(pc.circuitId)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] text-white/50">
                          {pc.speed} {pc.isRPM ? 'RPM' : 'GPM'}
                        </span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-white/30">
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            {/* Priming Settings */}
            {(pump.primingSpeed > 0 || pump.primingTime > 0) && (
              <section className="mb-6">
                <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">Priming</h2>
                <div className="bg-white/5 rounded-xl overflow-hidden">
                  <div className="flex justify-between items-center p-4 border-b border-white/5">
                    <span className="text-[14px] text-white/55">Speed</span>
                    <span className="text-[14px] font-medium">{pump.primingSpeed} RPM</span>
                  </div>
                  <div className="flex justify-between items-center p-4">
                    <span className="text-[14px] text-white/55">Duration</span>
                    <span className="text-[14px] font-medium">{pump.primingTime} min</span>
                  </div>
                </div>
              </section>
            )}

            {/* Speed Range */}
            {(pump.minSpeed || pump.maxSpeed) && (
              <section className="mb-6">
                <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">Speed Range</h2>
                <div className="bg-white/5 rounded-xl overflow-hidden">
                  <div className="flex justify-between items-center p-4 border-b border-white/5">
                    <span className="text-[14px] text-white/55">Minimum</span>
                    <span className="text-[14px] font-medium">{pump.minSpeed} RPM</span>
                  </div>
                  <div className="flex justify-between items-center p-4">
                    <span className="text-[14px] text-white/55">Maximum</span>
                    <span className="text-[14px] font-medium">{pump.maxSpeed} RPM</span>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Speed Editor Modal */}
      <div className={`modal-backdrop ${editingCircuit ? 'open' : ''}`} onClick={closeSpeedEditor} />
      <div 
        className={`modal-sheet ${editingCircuit ? 'open' : ''}`}
        style={{ transform: sheetTranslateY > 0 && editingCircuit ? `translateY(${sheetTranslateY}px)` : undefined }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="w-9 h-1.5 bg-white/30 rounded-full mx-auto mt-2 cursor-grab" />
        <div className="flex justify-between items-center px-5 py-4">
          <span className="text-[20px] font-semibold">
            {editingCircuit ? getCircuitName(editingCircuit.circuitId) : ''} Speed
          </span>
          <button onClick={closeSpeedEditor} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-white/60">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <div className="px-5 pb-8">
          {/* Speed Adjuster */}
          <div className="flex flex-col items-center py-6">
            <div className="flex items-center gap-6">
              <button
                onClick={() => setFormSpeed(Math.max(450, formSpeed - 50))}
                className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center active:scale-95"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                  <path d="M5 12h14"/>
                </svg>
              </button>
              <div className="text-center min-w-[140px]">
                <div className="text-[56px] font-light">{formSpeed}</div>
                <div className="text-[14px] text-white/40">{editingCircuit?.isRPM ? 'RPM' : 'GPM'}</div>
              </div>
              <button
                onClick={() => setFormSpeed(Math.min(3450, formSpeed + 50))}
                className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center active:scale-95"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </button>
            </div>
            <div className="text-[12px] text-white/35 mt-2">Range: 450 - 3450 RPM</div>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {[1000, 1500, 2000, 2500, 2850, 3000].map((speed) => (
              <button
                key={speed}
                onClick={() => setFormSpeed(speed)}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition ${
                  formSpeed === speed ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white/55'
                }`}
              >
                {speed}
              </button>
            ))}
          </div>

          {/* Save Button */}
          <button
            onClick={saveSpeed}
            disabled={saving}
            className="w-full bg-cyan-500 disabled:bg-white/10 disabled:text-white/30 text-black font-semibold py-3 rounded-xl active:opacity-80"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <Link href="/" className="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </Link>
        <Link href="/schedules" className="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Schedules</span>
        </Link>
        <Link href="/history" className="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-6"/></svg>
          <span>History</span>
        </Link>
        <Link href="/settings" className="nav-item active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>Settings</span>
        </Link>
      </nav>
    </>
  );
}
