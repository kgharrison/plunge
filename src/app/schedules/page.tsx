'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { loadSchedulesCache, saveSchedulesCache, isSchedulesCacheStale } from '@/lib/schedules-cache';

interface ScheduleEvent {
  scheduleId: number;
  circuitId: number;
  startTime: number;
  stopTime: number;
  dayMask: number;
  flags: number;
  heatCmd: number;
  heatSetPoint: number;
  scheduleType: 'recurring' | 'runonce';
}

interface CircuitDefinition {
  circuitId: number;
  name: string;
  function: number;
  interface: number;
  eggTimer: number;
}

interface ScheduleData {
  recurring: ScheduleEvent[];
  runOnce: ScheduleEvent[];
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

// Day names for display
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Format minutes from midnight to time string
function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Parse time string to minutes from midnight
function parseTime(timeStr: string): number {
  const [time, period] = timeStr.split(' ');
  const [hourStr, minStr] = time.split(':');
  let hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  
  return hour * 60 + min;
}

// Format day mask to readable string
function formatDays(mask: number): string {
  if (mask === 127) return 'Every Day';
  if (mask === 62) return 'Weekdays';
  if (mask === 65) return 'Weekends';
  
  const days = DAYS.filter((_, i) => mask & (1 << i));
  return days.join(', ') || 'None';
}

// Format egg timer runtime
function formatRuntime(minutes: number): string {
  if (minutes === 0 || minutes >= 720) return 'No limit';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function SchedulesPage() {
  // State - initialized empty, will load from cache in useEffect
  const [schedules, setSchedules] = useState<ScheduleData | null>(null);
  const [circuits, setCircuits] = useState<CircuitDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const hasFetchedRef = useRef(false);
  const cacheLoadedRef = useRef(false);
  
  // Editor state
  const [editingSchedule, setEditingSchedule] = useState<ScheduleEvent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingEggTimer, setEditingEggTimer] = useState<CircuitDefinition | null>(null);
  
  // Form state for schedule editor
  const [formCircuitId, setFormCircuitId] = useState(1);
  const [formStartTime, setFormStartTime] = useState('9:00 AM');
  const [formStopTime, setFormStopTime] = useState('5:00 PM');
  const [formDayMask, setFormDayMask] = useState(127);
  const [formScheduleType, setFormScheduleType] = useState<'recurring' | 'runonce'>('recurring');
  
  // Form state for egg timer editor
  const [formRuntime, setFormRuntime] = useState(180);
  
  // Saving state
  const [saving, setSaving] = useState(false);
  
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
      // Dismiss if dragged more than 100px
      closeScheduleEditor();
      closeEggTimerEditor();
    }
    setSheetTranslateY(0);
  };

  // Load credentials and cache on mount (client-side only)
  useEffect(() => {
    setCredentials(loadCredentials());
    
    // Load from cache for instant display
    if (!cacheLoadedRef.current) {
      cacheLoadedRef.current = true;
      const cache = loadSchedulesCache();
      if (cache?.schedules) {
        setSchedules(cache.schedules as ScheduleData);
        setCircuits((cache.circuits as CircuitDefinition[]) || []);
        setLoading(false);
      }
    }
  }, []);

  const fetchData = useCallback(async (showLoading = true) => {
    if (!credentials) return;
    
    // Only show loading if we don't have cached data or cache is stale
    const shouldShowLoading = showLoading && (!schedules || isSchedulesCacheStale());
    if (shouldShowLoading) {
      setLoading(true);
    }
    
    try {
      // Fetch schedules and circuits in parallel (using lightweight circuits endpoint)
      const [schedulesRes, circuitsRes] = await Promise.all([
        fetch('/api/schedules', { headers: getAuthHeaders(credentials) }),
        fetch('/api/config/circuits', { headers: getAuthHeaders(credentials) }),
      ]);
      
      if (!schedulesRes.ok) throw new Error('Failed to fetch schedules');
      if (!circuitsRes.ok) throw new Error('Failed to fetch circuits');
      
      const schedulesData = await schedulesRes.json();
      const circuitsData = await circuitsRes.json();
      
      setSchedules(schedulesData);
      setCircuits(circuitsData.circuits || []);
      setError(null);
      
      // Save to cache
      saveSchedulesCache({
        schedules: schedulesData,
        circuits: circuitsData.circuits || [],
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [credentials, schedules]);

  useEffect(() => {
    if (credentials && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      // If we have cached data, refresh in background without showing loading
      // If cache is stale or empty, show loading
      fetchData(!schedules || isSchedulesCacheStale());
    }
  }, [credentials, fetchData, schedules]);

  const getCircuitName = (circuitId: number): string => {
    const circuit = circuits.find(c => c.circuitId === circuitId);
    return circuit?.name || `Circuit ${circuitId}`;
  };

  const openScheduleEditor = (schedule?: ScheduleEvent) => {
    if (schedule) {
      setEditingSchedule(schedule);
      setFormCircuitId(schedule.circuitId);
      setFormStartTime(formatTime(schedule.startTime));
      setFormStopTime(formatTime(schedule.stopTime));
      setFormDayMask(schedule.dayMask);
      setFormScheduleType(schedule.scheduleType);
      setIsCreating(false);
    } else {
      setEditingSchedule(null);
      setFormCircuitId(circuits[0]?.circuitId || 1);
      setFormStartTime('9:00 AM');
      setFormStopTime('5:00 PM');
      setFormDayMask(127);
      setFormScheduleType('recurring');
      setIsCreating(true);
    }
  };

  const closeScheduleEditor = () => {
    setEditingSchedule(null);
    setIsCreating(false);
  };

  const saveSchedule = async () => {
    if (!credentials) return;
    
    setSaving(true);
    try {
      const body = {
        scheduleType: formScheduleType,
        circuitId: formCircuitId,
        startTime: parseTime(formStartTime),
        stopTime: parseTime(formStopTime),
        dayMask: formDayMask,
      };
      
      if (isCreating) {
        await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders(credentials) },
          body: JSON.stringify(body),
        });
      } else if (editingSchedule) {
        await fetch(`/api/schedules/${editingSchedule.scheduleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders(credentials) },
          body: JSON.stringify(body),
        });
      }
      
      closeScheduleEditor();
      fetchData();
    } catch (err) {
      console.error('Failed to save schedule:', err);
    } finally {
      setSaving(false);
    }
  };

  const deleteSchedule = async (scheduleId: number) => {
    if (!credentials) return;
    
    setSaving(true);
    try {
      await fetch(`/api/schedules/${scheduleId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(credentials),
      });
      closeScheduleEditor();
      fetchData();
    } catch (err) {
      console.error('Failed to delete schedule:', err);
    } finally {
      setSaving(false);
    }
  };

  const openEggTimerEditor = (circuit: CircuitDefinition) => {
    setEditingEggTimer(circuit);
    setFormRuntime(circuit.eggTimer || 180);
  };

  const closeEggTimerEditor = () => {
    setEditingEggTimer(null);
  };

  const saveEggTimer = async () => {
    if (!credentials || !editingEggTimer) return;
    
    setSaving(true);
    try {
      await fetch(`/api/config/circuit/${editingEggTimer.circuitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(credentials) },
        body: JSON.stringify({ runtime: formRuntime }),
      });
      closeEggTimerEditor();
      fetchData();
    } catch (err) {
      console.error('Failed to save egg timer:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    setFormDayMask(prev => prev ^ (1 << day));
  };

  // Time options for picker
  const timeOptions: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      timeOptions.push(formatTime(h * 60 + m));
    }
  }

  return (
    <>
      <div className="relative z-10 max-w-[430px] mx-auto px-4 pt-3 pb-24 min-h-dvh">
        {/* Header */}
        <header className="flex justify-between items-center py-2 mb-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight leading-none">Schedules</h1>
            <p className="text-[14px] text-white/50 mt-1">Automation & Timers</p>
          </div>
          <button
            onClick={() => openScheduleEditor()}
            className="w-10 h-10 bg-cyan-500 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5 text-black">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </header>

        {loading ? (
          <div className="flex items-center justify-center pt-32">
            <div className="text-white/40">Loading schedules...</div>
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
            {/* Programs Section */}
            <section className="mb-6">
              <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">Programs</h2>
              <div className="bg-white/5 rounded-xl overflow-hidden">
                {schedules?.recurring.length === 0 ? (
                  <div className="p-4 text-center text-white/40 text-[14px]">
                    No scheduled programs
                  </div>
                ) : (
                  schedules?.recurring.map((schedule) => (
                    <button
                      key={schedule.scheduleId}
                      onClick={() => openScheduleEditor(schedule)}
                      className="w-full flex justify-between items-center p-4 border-b border-white/5 last:border-0 active:bg-white/5 text-left"
                    >
                      <div>
                        <div className="text-[16px] font-medium">{getCircuitName(schedule.circuitId)}</div>
                        <div className="text-[14px] text-white/50">
                          {formatTime(schedule.startTime)} - {formatTime(schedule.stopTime)}
                        </div>
                        <div className="text-[12px] text-white/35 mt-0.5">{formatDays(schedule.dayMask)}</div>
                      </div>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-white/30">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </button>
                  ))
                )}
              </div>
            </section>

            {/* Run-Once Section (if any) */}
            {schedules && schedules.runOnce.length > 0 && (
              <section className="mb-6">
                <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">One-Time Events</h2>
                <div className="bg-white/5 rounded-xl overflow-hidden">
                  {schedules.runOnce.map((schedule) => (
                    <button
                      key={schedule.scheduleId}
                      onClick={() => openScheduleEditor(schedule)}
                      className="w-full flex justify-between items-center p-4 border-b border-white/5 last:border-0 active:bg-white/5 text-left"
                    >
                      <div>
                        <div className="text-[16px] font-medium">{getCircuitName(schedule.circuitId)}</div>
                        <div className="text-[14px] text-white/50">
                          {formatTime(schedule.startTime)} - {formatTime(schedule.stopTime)}
                        </div>
                      </div>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-white/30">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Egg Timers Section */}
            <section className="mb-6">
              <h2 className="text-[12px] font-semibold text-white/35 uppercase tracking-wider mb-3">Egg Timers</h2>
              <p className="text-[12px] text-white/30 mb-3">Auto-off duration when manually turned on</p>
              <div className="bg-white/5 rounded-xl overflow-hidden">
                {circuits.filter(c => c.circuitId > 0).map((circuit) => (
                  <button
                    key={circuit.circuitId}
                    onClick={() => openEggTimerEditor(circuit)}
                    className="w-full flex justify-between items-center p-4 border-b border-white/5 last:border-0 active:bg-white/5 text-left"
                  >
                    <div className="text-[16px] font-medium">{circuit.name}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] text-white/50">{formatRuntime(circuit.eggTimer)}</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-white/30">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </div>
                  </button>
                ))}
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
        <button className="nav-item active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Schedules</span>
        </button>
        <Link href="/history" className="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-6"/></svg>
          <span>History</span>
        </Link>
        <Link href="/settings" className="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>Settings</span>
        </Link>
      </nav>

      {/* Schedule Editor Modal */}
      <div className={`modal-backdrop ${editingSchedule || isCreating ? 'open' : ''}`} onClick={closeScheduleEditor} />
      <div 
        className={`modal-sheet ${editingSchedule || isCreating ? 'open' : ''}`}
        style={{ transform: sheetTranslateY > 0 && (editingSchedule || isCreating) ? `translateY(${sheetTranslateY}px)` : undefined }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="w-9 h-1.5 bg-white/30 rounded-full mx-auto mt-2 cursor-grab" />
        <div className="flex justify-between items-center px-5 py-4">
          <span className="text-[20px] font-semibold">{isCreating ? 'New Schedule' : 'Edit Schedule'}</span>
          <button onClick={closeScheduleEditor} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-white/60">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <div className="px-5 pb-8 overflow-y-auto max-h-[70vh]">
          {/* Schedule Type */}
          <div className="mb-4">
            <label className="block text-[14px] text-white/55 mb-2">Type</label>
            <div className="flex bg-white/5 rounded-xl p-1 gap-1">
              <button
                onClick={() => setFormScheduleType('recurring')}
                className={`flex-1 py-2.5 rounded-lg text-[14px] font-medium transition ${formScheduleType === 'recurring' ? 'bg-white/15 text-white' : 'text-white/55'}`}
              >
                Recurring
              </button>
              <button
                onClick={() => setFormScheduleType('runonce')}
                className={`flex-1 py-2.5 rounded-lg text-[14px] font-medium transition ${formScheduleType === 'runonce' ? 'bg-white/15 text-white' : 'text-white/55'}`}
              >
                One-Time
              </button>
            </div>
          </div>

          {/* Circuit */}
          <div className="mb-4">
            <label className="block text-[14px] text-white/55 mb-2">Circuit</label>
            <select
              value={formCircuitId}
              onChange={(e) => setFormCircuitId(parseInt(e.target.value))}
              className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2.5 text-[15px] focus:outline-none focus:border-cyan-500/50"
            >
              {circuits.map((circuit) => (
                <option key={circuit.circuitId} value={circuit.circuitId}>
                  {circuit.name}
                </option>
              ))}
            </select>
          </div>

          {/* Start Time */}
          <div className="mb-4">
            <label className="block text-[14px] text-white/55 mb-2">Start Time</label>
            <select
              value={formStartTime}
              onChange={(e) => setFormStartTime(e.target.value)}
              className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2.5 text-[15px] focus:outline-none focus:border-cyan-500/50"
            >
              {timeOptions.map((time) => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>

          {/* Stop Time */}
          <div className="mb-4">
            <label className="block text-[14px] text-white/55 mb-2">Stop Time</label>
            <select
              value={formStopTime}
              onChange={(e) => setFormStopTime(e.target.value)}
              className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2.5 text-[15px] focus:outline-none focus:border-cyan-500/50"
            >
              {timeOptions.map((time) => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>

          {/* Days (only for recurring) */}
          {formScheduleType === 'recurring' && (
            <div className="mb-6">
              <label className="block text-[14px] text-white/55 mb-2">Days</label>
              <div className="flex gap-1.5">
                {DAYS.map((day, i) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(i)}
                    className={`flex-1 py-2 rounded-lg text-[12px] font-medium transition ${
                      formDayMask & (1 << i) ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white/55'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setFormDayMask(127)}
                  className="text-[12px] text-cyan-400 px-2 py-1 bg-cyan-500/10 rounded"
                >
                  Every Day
                </button>
                <button
                  onClick={() => setFormDayMask(62)}
                  className="text-[12px] text-cyan-400 px-2 py-1 bg-cyan-500/10 rounded"
                >
                  Weekdays
                </button>
                <button
                  onClick={() => setFormDayMask(65)}
                  className="text-[12px] text-cyan-400 px-2 py-1 bg-cyan-500/10 rounded"
                >
                  Weekends
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={saveSchedule}
              disabled={saving}
              className="flex-1 bg-cyan-500 disabled:bg-white/10 disabled:text-white/30 text-black font-semibold py-3 rounded-xl active:opacity-80"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {!isCreating && editingSchedule && (
              <button
                onClick={() => deleteSchedule(editingSchedule.scheduleId)}
                disabled={saving}
                className="px-4 bg-red-500/20 text-red-400 font-semibold py-3 rounded-xl active:opacity-80"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Egg Timer Editor Modal */}
      <div className={`modal-backdrop ${editingEggTimer ? 'open' : ''}`} onClick={closeEggTimerEditor} />
      <div 
        className={`modal-sheet ${editingEggTimer ? 'open' : ''}`}
        style={{ transform: sheetTranslateY > 0 && editingEggTimer ? `translateY(${sheetTranslateY}px)` : undefined }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="w-9 h-1.5 bg-white/30 rounded-full mx-auto mt-2 cursor-grab" />
        <div className="flex justify-between items-center px-5 py-4">
          <span className="text-[20px] font-semibold">{editingEggTimer?.name} Timer</span>
          <button onClick={closeEggTimerEditor} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-white/60">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <div className="px-5 pb-8">
          <p className="text-[14px] text-white/50 mb-4">
            Set how long this circuit runs when manually turned on before automatically shutting off.
          </p>

          {/* Runtime Selector */}
          <div className="mb-6">
            <label className="block text-[14px] text-white/55 mb-2">Auto-off Duration</label>
            <div className="flex flex-col items-center py-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setFormRuntime(Math.max(0, formRuntime - 30))}
                  className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center active:scale-95"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <path d="M5 12h14"/>
                  </svg>
                </button>
                <div className="text-[48px] font-light min-w-[120px] text-center">
                  {formRuntime === 0 || formRuntime >= 720 ? '∞' : formatRuntime(formRuntime)}
                </div>
                <button
                  onClick={() => setFormRuntime(Math.min(720, formRuntime + 30))}
                  className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center active:scale-95"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Quick presets */}
            <div className="flex flex-wrap gap-2 justify-center">
              {[30, 60, 120, 180, 240, 720].map((mins) => (
                <button
                  key={mins}
                  onClick={() => setFormRuntime(mins)}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition ${
                    formRuntime === mins ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white/55'
                  }`}
                >
                  {mins >= 720 ? 'No limit' : formatRuntime(mins)}
                </button>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={saveEggTimer}
            disabled={saving}
            className="w-full bg-cyan-500 disabled:bg-white/10 disabled:text-white/30 text-black font-semibold py-3 rounded-xl active:opacity-80"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}
