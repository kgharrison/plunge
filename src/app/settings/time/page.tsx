'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { loadCache, saveCache, isCacheStale } from '@/lib/settings-cache';

interface SystemTime {
  date: string;
  adjustForDST: boolean;
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

// Timezone options (GMT offsets)
const TIMEZONES = [
  { value: -12, label: 'GMT-12' },
  { value: -11, label: 'GMT-11' },
  { value: -10, label: 'GMT-10 (Hawaii)' },
  { value: -9, label: 'GMT-9 (Alaska)' },
  { value: -8, label: 'GMT-8 (Pacific)' },
  { value: -7, label: 'GMT-7 (Mountain)' },
  { value: -6, label: 'GMT-6 (Central)' },
  { value: -5, label: 'GMT-5 (Eastern)' },
  { value: -4, label: 'GMT-4 (Atlantic)' },
  { value: -3, label: 'GMT-3' },
  { value: -2, label: 'GMT-2' },
  { value: -1, label: 'GMT-1' },
  { value: 0, label: 'GMT (UTC)' },
  { value: 1, label: 'GMT+1' },
  { value: 2, label: 'GMT+2' },
  { value: 3, label: 'GMT+3' },
  { value: 4, label: 'GMT+4' },
  { value: 5, label: 'GMT+5' },
  { value: 6, label: 'GMT+6' },
  { value: 7, label: 'GMT+7' },
  { value: 8, label: 'GMT+8' },
  { value: 9, label: 'GMT+9' },
  { value: 10, label: 'GMT+10' },
  { value: 11, label: 'GMT+11' },
  { value: 12, label: 'GMT+12' },
];

export default function TimeSettingsPage() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [systemTime, setSystemTime] = useState<SystemTime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deviceTime, setDeviceTime] = useState<Date>(new Date());

  useEffect(() => {
    setCredentials(loadCredentials());
    
    // Load cached data immediately
    const cache = loadCache();
    if (cache && cache.systemTime) {
      setSystemTime(cache.systemTime as SystemTime);
      if (!isCacheStale()) {
        setLoading(false);
      }
    }
    
    // Update device time every second
    const interval = setInterval(() => {
      setDeviceTime(new Date());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchData = useCallback(async (showLoading = true) => {
    if (!credentials) return;
    
    if (showLoading) setLoading(true);
    try {
      const res = await fetch('/api/config/system', { headers: getAuthHeaders(credentials) });
      
      if (!res.ok) throw new Error('Failed to fetch system time');
      
      const data = await res.json();
      setSystemTime(data);
      
      // Update cache
      saveCache({ systemTime: data });
      
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
      const hasCache = cache && cache.systemTime;
      fetchData(!hasCache || isCacheStale());
    }
  }, [credentials, fetchData]);

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

  const handleToggleDST = async () => {
    if (!credentials || !systemTime) return;
    
    setSaving(true);
    try {
      await fetch('/api/config/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(credentials) },
        body: JSON.stringify({ adjustForDST: !systemTime.adjustForDST }),
      });
      fetchData();
    } catch (err) {
      console.error('Failed to toggle DST:', err);
    } finally {
      setSaving(false);
    }
  };

  const formatDateTime = (isoDate: string): { date: string; time: string } => {
    const d = new Date(isoDate);
    return {
      date: d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
    };
  };

  const getTimeDifference = (): string => {
    if (!systemTime) return '';
    const controllerTime = new Date(systemTime.date);
    const diffMs = Math.abs(deviceTime.getTime() - controllerTime.getTime());
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 5) return 'In sync';
    if (diffSec < 60) return `${diffSec}s difference`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m difference`;
    return `${Math.floor(diffSec / 3600)}h difference`;
  };

  const controllerDateTime = systemTime ? formatDateTime(systemTime.date) : null;

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
            <h1 className="text-[24px] font-semibold tracking-tight leading-none">Time & Date</h1>
            <p className="text-[14px] text-white/50 mt-0.5">Controller clock settings</p>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center pt-32">
            <div className="text-white/40">Loading time settings...</div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center pt-32 gap-4">
            <div className="text-white/40">{error}</div>
            <button onClick={() => fetchData()} className="px-4 py-2 bg-white/10 rounded-lg text-white/70">
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Controller Time */}
            <section className="mb-6">
              <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">Controller Time</h2>
              <div className="bg-white/5 rounded-xl p-6 text-center">
                <div className="text-[48px] font-light tracking-tight">
                  {controllerDateTime?.time}
                </div>
                <div className="text-[16px] text-white/55 mt-1">
                  {controllerDateTime?.date}
                </div>
                <div className={`text-[13px] mt-3 ${getTimeDifference() === 'In sync' ? 'text-green-400' : 'text-orange-400'}`}>
                  {getTimeDifference()}
                </div>
              </div>
            </section>

            {/* Device Time (for reference) */}
            <section className="mb-6">
              <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">Your Device Time</h2>
              <div className="bg-white/5 rounded-xl overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b border-white/5">
                  <span className="text-[14px] text-white/55">Current Time</span>
                  <span className="text-[14px] font-medium font-mono">
                    {deviceTime.toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4">
                  <span className="text-[14px] text-white/55">Date</span>
                  <span className="text-[14px] font-medium">
                    {deviceTime.toLocaleDateString()}
                  </span>
                </div>
              </div>
            </section>

            {/* Sync Button */}
            <section className="mb-6">
              <button
                onClick={handleSyncTime}
                disabled={saving}
                className="w-full bg-cyan-500 disabled:bg-white/20 text-black font-semibold py-4 rounded-xl active:opacity-80 flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>
                {saving ? 'Syncing...' : 'Sync Controller to Device Time'}
              </button>
              <p className="text-[12px] text-white/30 text-center mt-2">
                Sets the controller clock to match your device
              </p>
            </section>

            {/* DST Setting */}
            <section className="mb-6">
              <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">Daylight Saving Time</h2>
              <div className="bg-white/5 rounded-xl overflow-hidden">
                <div className="flex justify-between items-center p-4">
                  <div className="text-[16px] font-medium">Adjust for DST</div>
                  <button
                    onClick={handleToggleDST}
                    disabled={saving}
                    className={`w-[51px] h-[31px] rounded-full relative transition-colors ${
                      systemTime?.adjustForDST ? 'bg-green-500' : 'bg-white/20'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-[27px] h-[27px] bg-white rounded-full shadow transition-transform ${
                      systemTime?.adjustForDST ? 'translate-x-5' : ''
                    }`} />
                  </button>
                </div>
              </div>
            </section>

            {/* Timezone Info */}
            <section className="mb-6">
              <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">Timezone</h2>
              <div className="bg-white/5 rounded-xl overflow-hidden">
                <div className="p-4">
                  <div className="text-[14px] text-white/50 mb-2">
                    The controller timezone is set in the Pentair app or on the controller panel.
                  </div>
                  <div className="text-[14px] text-white/70">
                    Your device timezone: <span className="font-medium">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
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
