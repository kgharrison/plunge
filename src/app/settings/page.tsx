'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { loadCache, saveCache, isCacheStale } from '@/lib/settings-cache';

interface Credentials {
  systemName: string;
  password: string;
}

interface FullConfig {
  controller: {
    controllerType: number;
    degC: boolean;
    equipment: Record<string, boolean>;
    circuitCount: number;
    circuitArray: { circuitId: number; name: string }[];
  };
  equipment: {
    heaterConfig: {
      body1SolarPresent: boolean;
      body1HeatPumpPresent: boolean;
    };
    pumps: {
      pumpId: number;
      pumpType: number;
      pumpName?: string;
      isRunning: boolean;
      watts: number;
      rpm: number;
    }[];
  };
}

interface SystemTime {
  date: string;
  adjustForDST: boolean;
}

interface PoolStatus {
  connected: boolean;
  connectionType: 'local' | 'remote';
  lastUpdated: string;
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

function saveCredentials(credentials: Credentials): void {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
}

function clearCredentials(): void {
  localStorage.removeItem(CREDENTIALS_KEY);
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

export default function SettingsPage() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [config, setConfig] = useState<FullConfig | null>(null);
  const [systemTime, setSystemTime] = useState<SystemTime | null>(null);
  const [status, setStatus] = useState<PoolStatus | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [settingsSystemName, setSettingsSystemName] = useState('');
  const [settingsPassword, setSettingsPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const creds = loadCredentials();
    setCredentials(creds);
    if (creds) {
      setSettingsSystemName(creds.systemName);
      setSettingsPassword(creds.password);
    }
    
    // Load cached data immediately
    const cache = loadCache();
    if (cache) {
      if (cache.config) setConfig(cache.config as FullConfig);
      if (cache.systemTime) setSystemTime(cache.systemTime as SystemTime);
      if (cache.status) setStatus(cache.status as PoolStatus);
      // Only show loading if cache is stale
      if (!isCacheStale()) {
        setLoading(false);
      }
    }
  }, []);

  const fetchData = useCallback(async (showLoading = true) => {
    if (!credentials) {
      setLoading(false);
      return;
    }
    
    if (showLoading) setLoading(true);
    setConnectionError(null);
    
    try {
      const [configRes, systemTimeRes, statusRes] = await Promise.all([
        fetch('/api/config', { headers: getAuthHeaders(credentials) }),
        fetch('/api/config/system', { headers: getAuthHeaders(credentials) }),
        fetch('/api/status', { headers: getAuthHeaders(credentials) }),
      ]);
      
      // Check if any request failed (could be auth error)
      if (!configRes.ok || !statusRes.ok) {
        const errorData = !configRes.ok ? await configRes.json().catch(() => ({})) : await statusRes.json().catch(() => ({}));
        const errorMsg = errorData.message || errorData.error || 'Connection failed';
        setConnectionError(errorMsg);
        setConfig(null);
        setSystemTime(null);
        setStatus(null);
        setLoading(false);
        return;
      }
      
      let newConfig = await configRes.json();
      const newSystemTime = systemTimeRes.ok ? await systemTimeRes.json() : null;
      const newStatus = await statusRes.json();
      
      // Try to get live pump status to merge with config
      if (newConfig?.equipment?.pumps?.length > 0) {
        const pumpId = newConfig.equipment.pumps[0].pumpId || 1;
        try {
          const pumpRes = await fetch(`/api/config/pump/${pumpId}`, { headers: getAuthHeaders(credentials) });
          if (pumpRes.ok) {
            const livePump = await pumpRes.json();
            // Merge live status into config
            newConfig = {
              ...newConfig,
              equipment: {
                ...newConfig.equipment,
                pumps: newConfig.equipment.pumps.map((p: any, i: number) => 
                  i === 0 ? { ...p, isRunning: livePump.isRunning, watts: livePump.watts, rpm: livePump.rpm, gpm: livePump.gpm } : p
                ),
              },
            };
          }
        } catch {
          // Live pump status failed, continue with config data
        }
      }
      
      setConfig(newConfig);
      if (newSystemTime) setSystemTime(newSystemTime);
      setStatus(newStatus);
      setConnectionError(null);
      
      // Update cache
      saveCache({ config: newConfig, systemTime: newSystemTime, status: newStatus });
    } catch (err) {
      console.error('Failed to fetch settings data:', err);
      setConnectionError((err as Error).message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  }, [credentials]);

  useEffect(() => {
    if (credentials) {
      // If we have cached data, fetch in background without loading indicator
      const cache = loadCache();
      const hasCache = cache && (cache.config || cache.systemTime || cache.status);
      fetchData(!hasCache || isCacheStale());
    } else {
      setLoading(false);
    }
  }, [credentials, fetchData]);

  const handleSaveCredentials = async () => {
    if (!settingsSystemName || !settingsPassword) return;
    
    let systemName = settingsSystemName.trim();
    if (!systemName.toLowerCase().startsWith('pentair:')) {
      systemName = `Pentair: ${systemName}`;
    }
    const testCreds = { systemName, password: settingsPassword };
    
    // Test the credentials before saving
    setSaving(true);
    setConnectionError(null);
    
    try {
      const res = await fetch('/api/status', { 
        headers: getAuthHeaders(testCreds) 
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Invalid credentials');
      }
      
      // Credentials work - save them
      saveCredentials(testCreds);
      setCredentials(testCreds);
      setSettingsSystemName(systemName);
      setConnectionError(null);
    } catch (err) {
      setConnectionError((err as Error).message || 'Failed to connect');
      // Don't save invalid credentials
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    clearCredentials();
    setCredentials(null);
    setSettingsSystemName('');
    setSettingsPassword('');
    setConfig(null);
    setSystemTime(null);
    setStatus(null);
  };

  const handleSyncTime = async () => {
    if (!credentials) return;
    
    setSaving(true);
    try {
      await fetch('/api/config/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(credentials) },
        body: JSON.stringify({ syncWithDevice: true }),
      });
      fetchData();
    } catch (err) {
      console.error('Failed to sync time:', err);
    } finally {
      setSaving(false);
    }
  };

  const formatSystemTime = (isoDate: string): string => {
    const date = new Date(isoDate);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getPumpTypeName = (type: number): string => {
    return PUMP_TYPES[type] || `Type ${type}`;
  };

  const getHeaterDescription = (): string => {
    if (!config) return 'Unknown';
    const parts: string[] = [];
    // Gas heater is standard on most Pentair systems - if solar is present,
    // "Solar Preferred" mode implies gas backup exists. We assume gas is present
    // unless explicitly a heat-pump-only or solar-only system.
    const hasSolar = config.equipment.heaterConfig.body1SolarPresent;
    const hasHeatPump = config.equipment.heaterConfig.body1HeatPumpPresent;
    // Standard systems have gas heater; heat pump systems typically don't
    if (!hasHeatPump) parts.push('Gas');
    if (hasSolar) parts.push('Solar');
    if (hasHeatPump) parts.push('Heat Pump');
    return parts.length > 0 ? parts.join(' + ') : 'None';
  };

  return (
    <>
      <div className="relative z-10 max-w-[430px] mx-auto px-4 pt-3 pb-24 min-h-dvh">
        {/* Header */}
        <header className="py-2 mb-4">
          <h1 className="text-[28px] font-semibold tracking-tight leading-none">Settings</h1>
        </header>

        {/* Account Section */}
        <section className="mb-6">
          <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">Account</h2>
          <div className="bg-white/5 rounded-xl overflow-hidden">
            <div className="p-4">
              <label className="block text-[14px] text-white/55 mb-2">System Name</label>
              <input
                type="text"
                value={settingsSystemName}
                onChange={(e) => setSettingsSystemName(e.target.value)}
                placeholder="XX-XX-XX (from your pool controller)"
                className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2.5 text-[15px] placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            <div className="p-4 pt-0">
              <label className="block text-[14px] text-white/55 mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={settingsPassword}
                  onChange={(e) => setSettingsPassword(e.target.value)}
                  placeholder="Your pool password"
                  className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2.5 pr-10 text-[15px] placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-0 bottom-0 flex items-center text-white/40 hover:text-white/60"
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                      <path d="M3 3l18 18M10.5 10.677a2 2 0 002.823 2.823"/>
                      <path d="M7.362 7.561C5.68 8.74 4.279 10.42 3 12c1.889 2.991 5.282 6 9 6 1.55 0 3.043-.523 4.395-1.35M12 6c4.008 0 6.701 3.158 9 6a15.66 15.66 0 01-1.078 1.5"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                      <path d="M12 14a2 2 0 100-4 2 2 0 000 4z"/>
                      <path d="M21 12c-1.889 2.991-5.282 6-9 6s-7.111-3.009-9-6c2.299-2.842 4.992-6 9-6s6.701 3.158 9 6z"/>
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-white/30 mt-1.5">Required for remote access. Local WiFi connections use network security.</p>
            </div>
            <div className="p-4 pt-0 flex gap-2">
              <button
                onClick={handleSaveCredentials}
                disabled={!settingsSystemName || !settingsPassword || saving}
                className="flex-1 bg-cyan-500 disabled:bg-white/10 disabled:text-white/30 text-black font-semibold py-2.5 rounded-lg active:opacity-80"
              >
                {saving ? 'Verifying...' : credentials ? 'Update' : 'Login'}
              </button>
              {credentials && (
                <button
                  onClick={handleLogout}
                  disabled={saving}
                  className="px-4 bg-red-500/20 text-red-400 font-semibold py-2.5 rounded-lg active:opacity-80 disabled:opacity-50"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Connection Info */}
        {credentials && (
          <section className="mb-6">
            <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">Connection</h2>
            <div className="bg-white/5 rounded-xl overflow-hidden">
              <div className="flex justify-between items-center p-4 border-b border-white/5">
                <span className="text-[14px] text-white/55">Status</span>
                {connectionError ? (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-[14px] font-medium text-red-400">Error</span>
                  </div>
                ) : status ? (
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${status.connectionType === 'local' ? 'bg-cyan-400' : 'bg-green-500'}`} />
                    <span className="text-[14px] font-medium">{status.connectionType === 'local' ? 'Local WiFi' : 'Remote Cloud'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                    <span className="text-[14px] font-medium text-white/50">Connecting...</span>
                  </div>
                )}
              </div>
              {connectionError && (
                <div className="p-4 border-b border-white/5 bg-red-500/10">
                  <p className="text-[13px] text-red-400">{connectionError}</p>
                </div>
              )}
              <div className="flex justify-between items-center p-4">
                <span className="text-[14px] text-white/55">System</span>
                <span className="text-[14px] font-medium text-white/80 truncate max-w-[180px]">{credentials?.systemName}</span>
              </div>
              {status?.connectionType === 'local' && (
                <div className="px-4 pb-3">
                  <p className="text-[11px] text-white/30">Connected via local network. Password is validated for remote connections only.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Equipment Section */}
        {config && (
          <section className="mb-6">
            <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">Equipment</h2>
            <div className="bg-white/5 rounded-xl overflow-hidden">
              <Link href="/settings/pump" className="flex justify-between items-center p-4 border-b border-white/5 active:bg-white/5">
                <div className="flex-1">
                  <div className="text-[16px] font-medium">Pump</div>
                  <div className="text-[14px] text-white/50">
                    {config.equipment.pumps.length > 0 
                      ? (config.equipment.pumps[0].pumpName || getPumpTypeName(config.equipment.pumps[0].pumpType))
                      : 'Not configured'}
                  </div>
                  {config.equipment.pumps.length > 0 && config.equipment.pumps[0].isRunning && (
                    <div className="flex gap-4 mt-2 text-[13px]">
                      <span className="text-cyan-400">{config.equipment.pumps[0].rpm} RPM</span>
                      <span className="text-white/50">{config.equipment.pumps[0].watts}W</span>
                      {config.equipment.pumps[0].gpm > 0 && config.equipment.pumps[0].gpm < 255 && (
                        <span className="text-white/50">{config.equipment.pumps[0].gpm} GPM</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {config.equipment.pumps.length > 0 && config.equipment.pumps[0].isRunning && (
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                  )}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-white/30">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
              </Link>
              <Link href="/settings/circuits" className="flex justify-between items-center p-4 border-b border-white/5 active:bg-white/5">
                <div>
                  <div className="text-[16px] font-medium">Circuits</div>
                  <div className="text-[14px] text-white/50">{config.controller.circuitCount} configured</div>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-white/30">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </Link>
              <div className="flex justify-between items-center p-4">
                <div>
                  <div className="text-[16px] font-medium">Heater</div>
                  <div className="text-[14px] text-white/50">{getHeaterDescription()}</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* System Section */}
        {systemTime && (
          <section className="mb-6">
            <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">System</h2>
            <div className="bg-white/5 rounded-xl overflow-hidden">
              <Link href="/settings/time" className="flex justify-between items-center p-4 border-b border-white/5 active:bg-white/5">
                <div>
                  <div className="text-[16px] font-medium">Time & Timezone</div>
                  <div className="text-[14px] text-white/50">{formatSystemTime(systemTime.date)}</div>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-white/30">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </Link>
              <button
                onClick={handleSyncTime}
                disabled={saving}
                className="w-full flex justify-between items-center p-4 active:bg-white/5 text-left"
              >
                <span className="text-[16px]">{saving ? 'Syncing...' : 'Sync Time with Device'}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-white/30">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>
              </button>
            </div>
          </section>
        )}

        {/* About Section */}
        <section className="mb-6">
          <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">About</h2>
          <div className="bg-white/5 rounded-xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-white/5">
              <span className="text-[14px] text-white/55">App</span>
              <span className="text-[14px] font-medium text-white/80">Plunge</span>
            </div>
            <div className="flex justify-between items-center p-4 border-b border-white/5">
              <span className="text-[14px] text-white/55">Version</span>
              <span className="text-[14px] font-medium text-white/80">1.0.0</span>
            </div>
            {config && (
              <div className="flex justify-between items-center p-4">
                <span className="text-[14px] text-white/55">Controller</span>
                <span className="text-[14px] font-medium text-white/80">
                  {config.controller.degC ? 'Celsius' : 'Fahrenheit'}
                </span>
              </div>
            )}
          </div>
        </section>
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
        <button className="nav-item active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>Settings</span>
        </button>
      </nav>
    </>
  );
}
