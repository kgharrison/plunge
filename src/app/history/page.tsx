'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';

interface TempPoint {
  time: string;
  temp: number;
}

interface RunPeriod {
  on: string;
  off: string;
}

interface HistoryData {
  airTemps: TempPoint[];
  poolTemps: TempPoint[];
  spaTemps: TempPoint[];
  poolSetPointTemps: TempPoint[];
  spaSetPointTemps: TempPoint[];
  poolRuns: RunPeriod[];
  spaRuns: RunPeriod[];
  solarRuns: RunPeriod[];
  heaterRuns: RunPeriod[];
  lightRuns: RunPeriod[];
}

const CREDENTIALS_KEY = 'plunge_credentials';

function loadCredentials() {
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

function getAuthHeaders(credentials: { systemName: string; password: string } | null): HeadersInit {
  if (!credentials) return {};
  return {
    'X-Pool-System-Name': credentials.systemName,
    'X-Pool-Password': credentials.password,
  };
}

// Calculate total runtime in minutes from run periods
function calculateRuntime(runs: RunPeriod[]): number {
  return runs.reduce((total, run) => {
    const start = new Date(run.on).getTime();
    const end = new Date(run.off).getTime();
    return total + (end - start) / (1000 * 60);
  }, 0);
}

// Format minutes to hours and minutes
function formatRuntime(minutes: number): string {
  if (minutes < 1) return '< 1m';
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// Get min/max from temp array
function getTempRange(temps: TempPoint[]): { min: number; max: number } {
  if (temps.length === 0) return { min: 0, max: 0 };
  const values = temps.map(t => t.temp);
  return { min: Math.min(...values), max: Math.max(...values) };
}

// Format time for display
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Format date for timeline
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Simple Temperature Chart (removed pinch-to-zoom for stability)
function TempChart({ 
  airTemps, 
  poolTemps, 
  spaTemps,
  poolRuns,
  spaRuns,
  viewStart,
  viewEnd,
}: { 
  airTemps: TempPoint[]; 
  poolTemps: TempPoint[]; 
  spaTemps: TempPoint[];
  poolRuns: RunPeriod[];
  spaRuns: RunPeriod[];
  viewStart: number; // timestamp for left edge of view
  viewEnd: number;   // timestamp for right edge of view
}) {
  // Filter data to only include points within the view window
  // This prevents lines from being drawn into areas where we don't have data
  const filterToViewWindow = (temps: TempPoint[]): TempPoint[] => {
    return temps.filter(t => {
      const time = new Date(t.time).getTime();
      return time >= viewStart && time <= viewEnd;
    });
  };

  const filteredAirTemps = filterToViewWindow(airTemps);
  const filteredPoolTemps = filterToViewWindow(poolTemps);
  const filteredSpaTemps = filterToViewWindow(spaTemps);

  // Combine all temps to find temperature range (use filtered data for display)
  const allTemps = [...filteredAirTemps, ...filteredPoolTemps, ...filteredSpaTemps];
  if (allTemps.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-white/30">
        No temperature data available
      </div>
    );
  }

  const minTemp = Math.min(...allTemps.map(t => t.temp)) - 5;
  const maxTemp = Math.max(...allTemps.map(t => t.temp)) + 5;
  const tempRange = maxTemp - minTemp || 1; // Prevent division by zero

  // Use the view window for x-axis (not the data's time range)
  const timeSpan = viewEnd - viewStart || 1; // Prevent division by zero

  // Convert to SVG coordinates
  const toX = (time: string) => {
    const t = new Date(time).getTime();
    const x = ((t - viewStart) / timeSpan) * 100;
    return isNaN(x) ? 50 : x; // Default to center if NaN
  };
  const toY = (temp: number) => {
    const y = 100 - ((temp - minTemp) / tempRange) * 100;
    return isNaN(y) ? 50 : y; // Default to center if NaN
  };

  // Check if a time is during a run period
  const isDuringRun = (time: string, runs: RunPeriod[]): boolean => {
    const t = new Date(time).getTime();
    return runs.some(run => {
      const onTime = new Date(run.on).getTime();
      const offTime = new Date(run.off).getTime();
      return t >= onTime && t <= offTime;
    });
  };

  // Create path for a series (continuous line connecting all points within view)
  const createPath = (temps: TempPoint[]): string => {
    if (temps.length === 0) return '';
    const sorted = [...temps].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    return sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.time)} ${toY(p.temp)}`).join(' ');
  };

  // Create segmented paths based on run status - each segment connects consecutive points
  const createSegmentedPaths = (temps: TempPoint[], runs: RunPeriod[]) => {
    if (temps.length === 0) return { duringRun: '', notDuringRun: '' };
    const sorted = [...temps].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    
    const duringRunSegments: string[] = [];
    const notDuringRunSegments: string[] = [];
    
    for (let i = 0; i < sorted.length - 1; i++) {
      const p1 = sorted[i];
      const p2 = sorted[i + 1];
      // A segment is "during run" if EITHER endpoint is during a run (show it bright if pump was on at any point)
      const segment = `M ${toX(p1.time)} ${toY(p1.temp)} L ${toX(p2.time)} ${toY(p2.temp)}`;
      
      if (isDuringRun(p1.time, runs) || isDuringRun(p2.time, runs)) {
        duringRunSegments.push(segment);
      } else {
        notDuringRunSegments.push(segment);
      }
    }
    
    return {
      duringRun: duringRunSegments.join(' '),
      notDuringRun: notDuringRunSegments.join(' '),
    };
  };

  // Create area path (for gradient fill) - only for "during run" portions
  const createAreaPath = (temps: TempPoint[], runs: RunPeriod[]): string => {
    if (temps.length === 0) return '';
    const sorted = [...temps].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    // Filter to only points during runs for the area fill
    const duringRunPoints = sorted.filter(p => isDuringRun(p.time, runs));
    if (duringRunPoints.length < 2) return '';
    
    const linePath = duringRunPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.time)} ${toY(p.temp)}`).join(' ');
    const lastX = toX(duringRunPoints[duringRunPoints.length - 1].time);
    const firstX = toX(duringRunPoints[0].time);
    return `${linePath} L ${lastX} 100 L ${firstX} 100 Z`;
  };

  // Create simple area path for air temps (no run status)
  const createSimpleAreaPath = (temps: TempPoint[]): string => {
    if (temps.length === 0) return '';
    const sorted = [...temps].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const linePath = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.time)} ${toY(p.temp)}`).join(' ');
    const lastX = toX(sorted[sorted.length - 1].time);
    const firstX = toX(sorted[0].time);
    return `${linePath} L ${lastX} 100 L ${firstX} 100 Z`;
  };

  // Get segmented paths for pool and spa - use FILTERED data
  const poolSegments = createSegmentedPaths(filteredPoolTemps, poolRuns);
  const spaSegments = createSegmentedPaths(filteredSpaTemps, spaRuns);

  return (
    <div className="relative">
      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 bottom-6 w-8 flex flex-col justify-between text-[10px] text-white/30">
        <span>{Math.round(maxTemp)}°</span>
        <span>{Math.round((maxTemp + minTemp) / 2)}°</span>
        <span>{Math.round(minTemp)}°</span>
      </div>
      
      {/* Chart */}
      <div className="ml-10 h-[200px]">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="airGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.3)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
            </linearGradient>
            <linearGradient id="poolGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0, 210, 211, 0.4)" />
              <stop offset="100%" stopColor="rgba(0, 210, 211, 0)" />
            </linearGradient>
            <linearGradient id="spaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255, 159, 10, 0.4)" />
              <stop offset="100%" stopColor="rgba(255, 159, 10, 0)" />
            </linearGradient>
          </defs>
          
          {/* Grid lines */}
          <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
          
          {/* Area fills - only for temps during pump run, using filtered data */}
          {filteredAirTemps.length > 0 && <path d={createSimpleAreaPath(filteredAirTemps)} fill="url(#airGradient)" />}
          {filteredPoolTemps.length > 0 && <path d={createAreaPath(filteredPoolTemps, poolRuns)} fill="url(#poolGradient)" />}
          {filteredSpaTemps.length > 0 && <path d={createAreaPath(filteredSpaTemps, spaRuns)} fill="url(#spaGradient)" />}
          
          {/* Lines - continuous but styled by segment based on pump status, using filtered data */}
          {filteredAirTemps.length > 0 && (
            <path d={createPath(filteredAirTemps)} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
          )}
          {/* Pool segments when pump is OFF - dimmed/dashed */}
          {poolSegments.notDuringRun && (
            <path d={poolSegments.notDuringRun} fill="none" stroke="rgba(0, 210, 211, 0.25)" strokeWidth="0.8" strokeDasharray="2,2" vectorEffect="non-scaling-stroke" />
          )}
          {/* Pool segments when pump is ON - solid/bright */}
          {poolSegments.duringRun && (
            <path d={poolSegments.duringRun} fill="none" stroke="#00d2d3" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          )}
          {/* Spa segments when pump is OFF - dimmed/dashed */}
          {spaSegments.notDuringRun && (
            <path d={spaSegments.notDuringRun} fill="none" stroke="rgba(255, 159, 10, 0.25)" strokeWidth="0.8" strokeDasharray="2,2" vectorEffect="non-scaling-stroke" />
          )}
          {/* Spa segments when pump is ON - solid/bright */}
          {spaSegments.duringRun && (
            <path d={spaSegments.duringRun} fill="none" stroke="#ff9f0a" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </div>
      
      {/* X-axis labels - use view window, not data range */}
      <div className="ml-10 flex justify-between text-[10px] text-white/30 mt-1">
        <span>{formatTime(new Date(viewStart).toISOString())}</span>
        <span>{formatTime(new Date((viewStart + viewEnd) / 2).toISOString())}</span>
        <span>{formatTime(new Date(viewEnd).toISOString())}</span>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-white/50 rounded" />
          <span className="text-[11px] text-white/50">Air</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-[#00d2d3] rounded" />
          <span className="text-[11px] text-white/50">Pool</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-[#ff9f0a] rounded" />
          <span className="text-[11px] text-white/50">Spa</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 border border-dashed border-white/30 rounded" />
          <span className="text-[10px] text-white/30">pump off</span>
        </div>
      </div>
    </div>
  );
}

// Horizontal scrollable timeline view (landscape mode)
function LongitudinalTimeline({ history, viewStart, viewEnd }: { history: HistoryData; viewStart: number; viewEnd: number }) {
  // Filter runs to only those overlapping with view window
  const filterRuns = (runs: RunPeriod[]): RunPeriod[] => {
    return runs.filter(run => {
      const onTime = new Date(run.on).getTime();
      const offTime = new Date(run.off).getTime();
      return onTime < viewEnd && offTime > viewStart;
    });
  };

  // Collect all events (filtered to view window)
  const events: { type: string; color: string; on: Date; off: Date; duration: number }[] = [];
  
  filterRuns(history.poolRuns).forEach(r => events.push({ 
    type: 'Pool', color: '#00d2d3', on: new Date(r.on), off: new Date(r.off),
    duration: (new Date(r.off).getTime() - new Date(r.on).getTime()) / (1000 * 60)
  }));
  filterRuns(history.spaRuns).forEach(r => events.push({ 
    type: 'Spa', color: '#ff9f0a', on: new Date(r.on), off: new Date(r.off),
    duration: (new Date(r.off).getTime() - new Date(r.on).getTime()) / (1000 * 60)
  }));
  filterRuns(history.heaterRuns).forEach(r => events.push({ 
    type: 'Heater', color: '#ff453a', on: new Date(r.on), off: new Date(r.off),
    duration: (new Date(r.off).getTime() - new Date(r.on).getTime()) / (1000 * 60)
  }));
  filterRuns(history.solarRuns).forEach(r => events.push({ 
    type: 'Solar', color: '#ffcc00', on: new Date(r.on), off: new Date(r.off),
    duration: (new Date(r.off).getTime() - new Date(r.on).getTime()) / (1000 * 60)
  }));
  filterRuns(history.lightRuns).forEach(r => events.push({ 
    type: 'Lights', color: '#bf5af2', on: new Date(r.on), off: new Date(r.off),
    duration: (new Date(r.off).getTime() - new Date(r.on).getTime()) / (1000 * 60)
  }));

  // Use the view window for time bounds (same as temperature chart)
  const minTime = viewStart;
  const maxTime = viewEnd;
  const timeSpan = maxTime - minTime || 1;

  if (events.length === 0) {
    // Match height of filled timeline: 5 rows × (24px + 4px gap) + time axis (~20px)
    return (
      <div className="h-[160px] flex items-center justify-center text-white/30">
        No equipment activity recorded
      </div>
    );
  }

  // Fixed width - no horizontal scrolling, matches temperature chart
  const totalWidth = '100%';

  // Group events by type for stacked view
  const types = ['Pool', 'Spa', 'Heater', 'Solar', 'Lights'];
  const rowHeight = 24;
  const rowGap = 4;

  // Color map for types
  const colorMap: Record<string, string> = {
    'Pool': '#00d2d3',
    'Spa': '#ff9f0a', 
    'Heater': '#ff453a',
    'Solar': '#ffcc00',
    'Lights': '#bf5af2',
  };

  return (
    <div>
      {/* Timeline rows - aligned with temperature chart */}
      <div className="relative ml-10" style={{ height: types.length * (rowHeight + rowGap) }}>
        {types.map((type, rowIndex) => {
          const typeEvents = events.filter(e => e.type === type);
          const color = colorMap[type] || '#666';
          
          return (
            <div 
              key={type}
              className="absolute left-0 right-0 flex items-center"
              style={{ top: rowIndex * (rowHeight + rowGap), height: rowHeight }}
            >
              {/* Row background */}
              <div className="absolute inset-0 bg-white/5 rounded" />
              
              {/* Events - positioned using same percentage as temp chart */}
              {typeEvents.map((event, i) => {
                const startTime = Math.max(event.on.getTime(), minTime);
                const endTime = Math.min(event.off.getTime(), maxTime);
                if (endTime <= startTime) return null; // Event outside view
                
                const leftPct = ((startTime - minTime) / timeSpan) * 100;
                const widthPct = ((endTime - startTime) / timeSpan) * 100;
                return (
                  <div
                    key={i}
                    className="absolute top-1 bottom-1 rounded"
                    style={{
                      left: `${Math.max(0, leftPct)}%`,
                      width: `${Math.max(widthPct, 0.5)}%`,
                      background: color,
                      boxShadow: `0 0 6px ${color}`,
                    }}
                  />
                );
              })}
              
              {/* Row label */}
              <span className="absolute left-2 text-[10px] font-medium text-white/60 z-10">
                {type}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Compressed Timeline - shows activity blocks without gaps
function CompressedTimeline({ history, viewStart, viewEnd }: { history: HistoryData; viewStart: number; viewEnd: number }) {
  // Filter and clip runs to view window
  const filterAndClipRuns = (runs: RunPeriod[]): RunPeriod[] => {
    return runs
      .filter(run => {
        const onTime = new Date(run.on).getTime();
        const offTime = new Date(run.off).getTime();
        return onTime < viewEnd && offTime > viewStart;
      })
      .map(run => {
        const onTime = Math.max(new Date(run.on).getTime(), viewStart);
        const offTime = Math.min(new Date(run.off).getTime(), viewEnd);
        return { on: new Date(onTime).toISOString(), off: new Date(offTime).toISOString() };
      });
  };

  // Collect all events and sort by time (filtered to view window)
  const events: { type: string; color: string; on: string; off: string; duration: number }[] = [];
  
  filterAndClipRuns(history.poolRuns).forEach(r => events.push({ 
    type: 'Pool', color: '#00d2d3', on: r.on, off: r.off,
    duration: (new Date(r.off).getTime() - new Date(r.on).getTime()) / (1000 * 60)
  }));
  filterAndClipRuns(history.spaRuns).forEach(r => events.push({ 
    type: 'Spa', color: '#ff9f0a', on: r.on, off: r.off,
    duration: (new Date(r.off).getTime() - new Date(r.on).getTime()) / (1000 * 60)
  }));
  filterAndClipRuns(history.heaterRuns).forEach(r => events.push({ 
    type: 'Heater', color: '#ff453a', on: r.on, off: r.off,
    duration: (new Date(r.off).getTime() - new Date(r.on).getTime()) / (1000 * 60)
  }));
  filterAndClipRuns(history.solarRuns).forEach(r => events.push({ 
    type: 'Solar', color: '#ffcc00', on: r.on, off: r.off,
    duration: (new Date(r.off).getTime() - new Date(r.on).getTime()) / (1000 * 60)
  }));
  filterAndClipRuns(history.lightRuns).forEach(r => events.push({ 
    type: 'Lights', color: '#bf5af2', on: r.on, off: r.off,
    duration: (new Date(r.off).getTime() - new Date(r.on).getTime()) / (1000 * 60)
  }));

  if (events.length === 0) {
    // Match height of filled view: bar (48px) + legend (~24px)
    return (
      <div className="h-[72px] flex items-center justify-center text-white/30">
        No equipment activity recorded
      </div>
    );
  }

  // Aggregate events by type (combine all runs of same equipment)
  const aggregatedByType: { type: string; color: string; totalDuration: number }[] = [];
  const typeOrder = ['Pool', 'Spa', 'Heater', 'Solar', 'Lights'];
  
  for (const type of typeOrder) {
    const typeEvents = events.filter(e => e.type === type);
    if (typeEvents.length > 0) {
      const totalDuration = typeEvents.reduce((sum, e) => sum + e.duration, 0);
      aggregatedByType.push({
        type,
        color: typeEvents[0].color,
        totalDuration,
      });
    }
  }

  // Calculate total duration for proportional widths
  const totalDuration = aggregatedByType.reduce((sum, e) => sum + e.totalDuration, 0);

  return (
    <div className="space-y-2">
      {/* Compressed bar view - one segment per equipment type */}
      <div className="h-12 bg-white/5 rounded-xl flex overflow-hidden">
        {aggregatedByType.map((item, i) => {
          const widthPct = Math.max((item.totalDuration / totalDuration) * 100, 2); // Min 2% for visibility
          return (
            <div
              key={item.type}
              className="h-full flex items-center justify-center relative group"
              style={{
                width: `${widthPct}%`,
                background: `linear-gradient(180deg, ${item.color}40 0%, ${item.color}20 100%)`,
                borderRight: i < aggregatedByType.length - 1 ? '1px solid rgba(0,0,0,0.3)' : 'none',
              }}
            >
              {widthPct > 8 && (
                <span className="text-[10px] font-medium text-white/70 truncate px-1">
                  {item.type}
                </span>
              )}
              {/* Tooltip on hover/tap */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 rounded text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                {item.type}: {formatRuntime(item.totalDuration)}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Legend with totals */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
        {['Pool', 'Spa', 'Heater', 'Solar', 'Lights'].map(type => {
          const typeEvents = events.filter(e => e.type === type);
          if (typeEvents.length === 0) return null;
          const totalMins = typeEvents.reduce((sum, e) => sum + e.duration, 0);
          const color = typeEvents[0].color;
          return (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-[11px] text-white/50">{type}</span>
              <span className="text-[11px] text-white/30">{formatRuntime(totalMins)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ label, value, subValue, icon, color }: { 
  label: string; 
  value: string; 
  subValue?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white/5 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
          <div style={{ color }}>{icon}</div>
        </div>
        <span className="text-[11px] text-white/40 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-[22px] font-semibold tracking-tight">{value}</div>
      {subValue && <div className="text-[11px] text-white/35">{subValue}</div>}
    </div>
  );
}

type TimeRange = '24h' | '7d' | '30d';

const TIME_RANGES: { value: TimeRange; label: string; hours: number }[] = [
  { value: '24h', label: '24h', hours: 24 },
  { value: '7d', label: '7d', hours: 24 * 7 },
  { value: '30d', label: '30d', hours: 24 * 30 },
];

// Time grid component - vertical lines at fixed times that scroll with drag
function TimeGrid({ endDate, timeRange, isDragging }: { endDate: Date; timeRange: TimeRange; isDragging?: boolean }) {
  const rangeConfig = TIME_RANGES.find(r => r.value === timeRange);
  const hours = rangeConfig?.hours || 24;
  const viewStart = endDate.getTime() - hours * 60 * 60 * 1000;
  const viewEnd = endDate.getTime();
  const viewSpan = viewEnd - viewStart;
  
  // Determine grid interval based on time range
  let intervalMs: number;
  let formatLabel: (d: Date) => string;
  let isMajorLine: (d: Date) => boolean;
  
  if (timeRange === '24h') {
    intervalMs = 2 * 60 * 60 * 1000; // Every 2 hours
    formatLabel = (d) => `${d.getHours()}:00`;
    isMajorLine = (d) => d.getHours() === 0 || d.getHours() === 12;
  } else if (timeRange === '7d') {
    intervalMs = 24 * 60 * 60 * 1000; // Every day
    formatLabel = (d) => d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    isMajorLine = (d) => d.getDay() === 0; // Sunday
  } else {
    intervalMs = 2 * 24 * 60 * 60 * 1000; // Every 2 days
    formatLabel = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    isMajorLine = (d) => d.getDate() === 1; // First of month
  }
  
  // Find the first grid line before or at viewStart (snap to interval)
  const firstLineTime = Math.floor(viewStart / intervalMs) * intervalMs;
  
  // Generate all grid lines that fall within the extended view
  // (extend beyond view to ensure smooth scrolling)
  const gridLines: { time: number; label: string; isMajor: boolean }[] = [];
  
  for (let t = firstLineTime; t <= viewEnd + intervalMs; t += intervalMs) {
    const d = new Date(t);
    gridLines.push({
      time: t,
      label: formatLabel(d),
      isMajor: isMajorLine(d),
    });
  }
  
  // Enhanced visibility during drag
  const lineOpacity = isDragging ? 1.5 : 1;
  
  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${isDragging ? 'opacity-100' : 'opacity-60'}`}>
      {gridLines.map((line, i) => {
        // Calculate position as percentage of view
        const x = ((line.time - viewStart) / viewSpan) * 100;
        
        return (
          <div
            key={`${line.time}-${i}`}
            className="absolute top-0 bottom-0 flex flex-col items-center"
            style={{ left: `${x}%` }}
          >
            <div 
              className="w-px h-full"
              style={{ 
                backgroundColor: line.isMajor 
                  ? `rgba(255,255,255,${0.25 * lineOpacity})` 
                  : `rgba(255,255,255,${0.12 * lineOpacity})` 
              }}
            />
            <span 
              className="absolute bottom-0 whitespace-nowrap transform -translate-x-1/2"
              style={{ 
                fontSize: '9px',
                color: line.isMajor 
                  ? `rgba(255,255,255,${0.5 * lineOpacity})` 
                  : `rgba(255,255,255,${0.3 * lineOpacity})` 
              }}
            >
              {line.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Cache structure to track what data we have
interface CacheInfo {
  timeRange: TimeRange;
  dataStart: number; // Earliest timestamp we have data for (based on air temps)
  dataEnd: number;   // Latest timestamp we have data for
  data: HistoryData;
}

// Merge two HistoryData objects, deduping by timestamp
function mergeHistoryData(existing: HistoryData, newData: HistoryData): HistoryData {
  const mergeTemps = (a: TempPoint[], b: TempPoint[]): TempPoint[] => {
    const map = new Map<string, TempPoint>();
    [...a, ...b].forEach(p => map.set(p.time, p));
    return Array.from(map.values()).sort((x, y) => 
      new Date(x.time).getTime() - new Date(y.time).getTime()
    );
  };
  
  const mergeRuns = (a: RunPeriod[], b: RunPeriod[]): RunPeriod[] => {
    const map = new Map<string, RunPeriod>();
    [...a, ...b].forEach(r => map.set(`${r.on}-${r.off}`, r));
    return Array.from(map.values()).sort((x, y) => 
      new Date(x.on).getTime() - new Date(y.on).getTime()
    );
  };
  
  return {
    airTemps: mergeTemps(existing.airTemps, newData.airTemps),
    poolTemps: mergeTemps(existing.poolTemps, newData.poolTemps),
    spaTemps: mergeTemps(existing.spaTemps, newData.spaTemps),
    poolSetPointTemps: mergeTemps(existing.poolSetPointTemps, newData.poolSetPointTemps),
    spaSetPointTemps: mergeTemps(existing.spaSetPointTemps, newData.spaSetPointTemps),
    poolRuns: mergeRuns(existing.poolRuns, newData.poolRuns),
    spaRuns: mergeRuns(existing.spaRuns, newData.spaRuns),
    solarRuns: mergeRuns(existing.solarRuns, newData.solarRuns),
    heaterRuns: mergeRuns(existing.heaterRuns, newData.heaterRuns),
    lightRuns: mergeRuns(existing.lightRuns, newData.lightRuns),
  };
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [endDate, setEndDate] = useState<Date>(() => new Date());
  const [isDragging, setIsDragging] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Set mounted after first render to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Drag state
  const dragRef = useRef<{ startX: number; startEndDate: Date } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Fetch debounce
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);
  
  // Cache ref - persists across renders but doesn't trigger re-renders
  const cacheRef = useRef<CacheInfo | null>(null);

  const fetchHistory = useCallback(async (range: TimeRange, end: Date, forceRefresh = false) => {
    const rangeConfig = TIME_RANGES.find(r => r.value === range);
    const hours = rangeConfig?.hours || 24;
    
    // Calculate exact view window (what's shown on the graph)
    const viewEnd = end.getTime();
    const viewStart = viewEnd - hours * 60 * 60 * 1000;
    
    // Check cache - if we have data covering the view window, use it
    const cache = cacheRef.current;
    if (!forceRefresh && cache && cache.timeRange === range) {
      // Check if cache covers the view window (with some tolerance for edge cases)
      const tolerance = 5 * 60 * 1000; // 5 minutes tolerance
      const cacheCoversView = cache.dataStart <= viewStart + tolerance && cache.dataEnd >= viewEnd - tolerance;
      
      if (cacheCoversView) {
        console.log('[History] Cache hit:', {
          range,
          viewStart: new Date(viewStart).toISOString(),
          viewEnd: new Date(viewEnd).toISOString(),
          cacheStart: new Date(cache.dataStart).toISOString(),
          cacheEnd: new Date(cache.dataEnd).toISOString(),
        });
        setHistory(cache.data);
        setLoading(false);
        return;
      }
      
      console.log('[History] Cache miss - need more data:', {
        range,
        viewStart: new Date(viewStart).toISOString(),
        viewEnd: new Date(viewEnd).toISOString(),
        cacheStart: new Date(cache.dataStart).toISOString(),
        cacheEnd: new Date(cache.dataEnd).toISOString(),
        needEarlier: viewStart < cache.dataStart,
        needLater: viewEnd > cache.dataEnd,
      });
    }
    
    // Request extra buffer to account for controller timezone quirks
    const bufferMs = 48 * 60 * 60 * 1000; // 48 hours buffer
    let fetchStart = viewStart - bufferMs;
    let fetchEnd = viewEnd + bufferMs;
    
    // If we have cache, only fetch what we're missing (extend in the needed direction)
    if (!forceRefresh && cache && cache.timeRange === range) {
      if (viewStart < cache.dataStart && viewEnd <= cache.dataEnd) {
        // Need earlier data - fetch from new start to cache start
        fetchEnd = cache.dataStart + bufferMs;
      } else if (viewEnd > cache.dataEnd && viewStart >= cache.dataStart) {
        // Need later data - fetch from cache end to new end
        fetchStart = cache.dataEnd - bufferMs;
      }
      // If we need both directions, fetch the full range (already set above)
    }
    
    console.log('[History] Fetching:', {
      range,
      hours,
      endDate: end.toISOString(),
      viewStart: new Date(viewStart).toISOString(),
      viewEnd: new Date(viewEnd).toISOString(),
      fetchStart: new Date(fetchStart).toISOString(),
      fetchEnd: new Date(fetchEnd).toISOString(),
      forceRefresh,
    });
    
    isFetchingRef.current = true;
    setLoading(true);
    const credentials = loadCredentials();
    
    try {
      const params = new URLSearchParams({
        from: new Date(fetchStart).toISOString(),
        to: new Date(fetchEnd).toISOString(),
      });
      const res = await fetch(`/api/history?${params}`, {
        headers: getAuthHeaders(credentials),
      });
      if (!res.ok) throw new Error('Failed to fetch history');
      const newData: HistoryData = await res.json();
      
      // Merge with existing cache if same time range
      let mergedData: HistoryData;
      if (!forceRefresh && cache && cache.timeRange === range) {
        mergedData = mergeHistoryData(cache.data, newData);
      } else {
        mergedData = newData;
      }
      
      // Calculate data bounds from air temps (most reliable continuous data)
      const airTimes = mergedData.airTemps.map(t => new Date(t.time).getTime());
      const dataStart = airTimes.length > 0 ? Math.min(...airTimes) : viewStart;
      const dataEnd = airTimes.length > 0 ? Math.max(...airTimes) : viewEnd;
      
      // Update cache
      cacheRef.current = {
        timeRange: range,
        dataStart,
        dataEnd,
        data: mergedData,
      };
      
      console.log('[History] Data received and cached:', {
        airTemps: mergedData.airTemps.length,
        poolTemps: mergedData.poolTemps.length,
        cacheRange: `${new Date(dataStart).toISOString()} to ${new Date(dataEnd).toISOString()}`,
      });
      
      setHistory(mergedData);
      setError(null);
    } catch (err) {
      console.error('[History] Error:', err);
      setError((err as Error).message);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  // Check if cache covers a given view window (without triggering state updates)
  const checkCacheCovers = useCallback((range: TimeRange, end: Date): boolean => {
    const rangeConfig = TIME_RANGES.find(r => r.value === range);
    const hours = rangeConfig?.hours || 24;
    const viewEnd = end.getTime();
    const viewStart = viewEnd - hours * 60 * 60 * 1000;
    
    const cache = cacheRef.current;
    if (!cache || cache.timeRange !== range) return false;
    
    const tolerance = 5 * 60 * 1000; // 5 minutes tolerance
    return cache.dataStart <= viewStart + tolerance && cache.dataEnd >= viewEnd - tolerance;
  }, []);

  // Debounced fetch - triggers after drag stops
  const debouncedFetch = useCallback((range: TimeRange, end: Date) => {
    // Clear any pending debounce
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    // Check cache first - if we have the data, use it immediately (no loading indicator)
    if (checkCacheCovers(range, end)) {
      // Cache hit - update history from cache immediately, no loading state
      fetchHistory(range, end);
      return;
    }
    
    // Cache miss - show loading indicator and debounce the fetch
    setLoading(true);
    
    // Debounce the actual fetch by 300ms
    fetchTimeoutRef.current = setTimeout(() => {
      fetchTimeoutRef.current = null;
      fetchHistory(range, end);
    }, 300);
  }, [fetchHistory, checkCacheCovers]);

  // Initial fetch on mount
  useEffect(() => {
    fetchHistory(timeRange, endDate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTimeRangeChange = (range: TimeRange) => {
    // Clear cache when switching time ranges (different data density)
    if (range !== timeRange) {
      cacheRef.current = null;
    }
    setTimeRange(range);
    fetchHistory(range, endDate);
  };

  // Drag handlers for time navigation
  const handleDragStart = (clientX: number) => {
    dragRef.current = { startX: clientX, startEndDate: endDate };
    setIsDragging(true);
  };

  const handleDragMove = (clientX: number) => {
    if (!dragRef.current || !containerRef.current) return;
    
    const deltaX = dragRef.current.startX - clientX;
    const containerWidth = containerRef.current.offsetWidth;
    const rangeConfig = TIME_RANGES.find(r => r.value === timeRange);
    const hours = rangeConfig?.hours || 24;
    
    // Map drag distance to time: full container width = full time range
    const msPerPixel = (hours * 60 * 60 * 1000) / containerWidth;
    const deltaMs = deltaX * msPerPixel;
    
    const newEndDate = new Date(dragRef.current.startEndDate.getTime() + deltaMs);
    const now = new Date();
    
    // Clamp to not go into future
    const clampedDate = newEndDate > now ? now : newEndDate;
    setEndDate(clampedDate);
    
    // Use debounced fetch during drag
    debouncedFetch(timeRange, clampedDate);
  };

  const handleDragEnd = () => {
    if (dragRef.current) {
      // Trigger final fetch when drag ends
      debouncedFetch(timeRange, endDate);
    }
    dragRef.current = null;
    setIsDragging(false);
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    handleDragStart(e.clientX);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        handleDragMove(e.clientX);
      }
    };
    
    const handleMouseUp = () => {
      handleDragEnd();
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [timeRange]);

  // Format the date range for display
  const formatDateRange = () => {
    const rangeConfig = TIME_RANGES.find(r => r.value === timeRange);
    const hours = rangeConfig?.hours || 24;
    const fromTime = new Date(endDate.getTime() - hours * 60 * 60 * 1000);
    
    const formatDate = (d: Date) => {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    const formatTime = (d: Date) => {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    };
    
    if (timeRange === '24h') {
      return `${formatDate(fromTime)} ${formatTime(fromTime)} - ${formatDate(endDate)} ${formatTime(endDate)}`;
    }
    return `${formatDate(fromTime)} - ${formatDate(endDate)}`;
  };
  
  const isAtPresent = endDate.getTime() >= Date.now() - 60000;

  // Calculate view window
  const viewEnd = endDate.getTime();
  const viewStart = viewEnd - (TIME_RANGES.find(r => r.value === timeRange)?.hours || 24) * 60 * 60 * 1000;

  // Filter runs to only include those overlapping with view window, and clip to window bounds
  const filterRunsToWindow = (runs: RunPeriod[]): RunPeriod[] => {
    return runs
      .filter(run => {
        const onTime = new Date(run.on).getTime();
        const offTime = new Date(run.off).getTime();
        return onTime < viewEnd && offTime > viewStart;
      })
      .map(run => {
        // Clip run times to window bounds for accurate runtime calculation
        const onTime = Math.max(new Date(run.on).getTime(), viewStart);
        const offTime = Math.min(new Date(run.off).getTime(), viewEnd);
        return {
          on: new Date(onTime).toISOString(),
          off: new Date(offTime).toISOString(),
        };
      });
  };

  // Filter temps to only include those within view window
  const filterTempsToWindow = (temps: TempPoint[]): TempPoint[] => {
    return temps.filter(t => {
      const time = new Date(t.time).getTime();
      return time >= viewStart && time <= viewEnd;
    });
  };

  // Calculate stats using filtered data
  const poolRuntime = history ? calculateRuntime(filterRunsToWindow(history.poolRuns)) : 0;
  const spaRuntime = history ? calculateRuntime(filterRunsToWindow(history.spaRuns)) : 0;
  const heaterRuntime = history ? calculateRuntime(filterRunsToWindow(history.heaterRuns)) : 0;
  const solarRuntime = history ? calculateRuntime(filterRunsToWindow(history.solarRuns)) : 0;
  const airRange = history ? getTempRange(filterTempsToWindow(history.airTemps)) : { min: 0, max: 0 };
  const poolRange = history ? getTempRange(filterTempsToWindow(history.poolTemps)) : { min: 0, max: 0 };


  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2 text-white/60">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span className="text-[15px]">Back</span>
          </Link>
          <h1 className="text-[17px] font-semibold">History</h1>
          <div className="w-16" /> {/* Spacer for centering */}
        </div>
        
        {/* Time Range Selector */}
        <div className="flex justify-center gap-1 px-4 pb-2">
          {TIME_RANGES.map(range => (
            <button
              key={range.value}
              onClick={() => handleTimeRangeChange(range.value)}
              className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                timeRange === range.value
                  ? 'bg-cyan-500 text-black'
                  : 'bg-white/10 text-white/60'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
        
        {/* Date Range Display */}
        <div className="flex items-center justify-center gap-2 px-4 pb-3">
          <span className="text-[13px] text-white/50">{formatDateRange()}</span>
          {!isAtPresent && (
            <button
              onClick={() => {
                const now = new Date();
                setEndDate(now);
                // Force refresh when jumping to now to get latest data
                fetchHistory(timeRange, now, true);
              }}
              className="text-[11px] text-cyan-400 px-2 py-0.5 rounded-full bg-cyan-500/10"
            >
              Jump to Now
            </button>
          )}
        </div>
      </header>

      <div 
        ref={containerRef}
        className="px-5 py-4 cursor-grab active:cursor-grabbing select-none relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {loading && !history ? (
          <>
            {/* Skeleton Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white/5 rounded-xl p-3 h-[72px] animate-pulse" />
              ))}
            </div>
            
            {/* Skeleton Temperature Chart */}
            <div className="mb-6">
              <div className="h-4 w-24 bg-white/10 rounded mb-3 animate-pulse" />
              <div className="bg-white/5 rounded-xl p-4 relative overflow-hidden">
                <div className="h-[200px] flex items-center justify-center">
                  {/* Loading spinner */}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 rounded-full border border-cyan-500/30">
                    <div className="relative w-4 h-4">
                      <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30" />
                      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" />
                    </div>
                    <span className="text-[11px] text-cyan-400/80">Loading...</span>
                  </div>
                </div>
                {/* Skeleton legend */}
                <div className="flex justify-center gap-4 mt-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-3 w-12 bg-white/5 rounded animate-pulse" />
                  ))}
                </div>
              </div>
            </div>
            
            {/* Skeleton Timeline */}
            <div className="mb-6">
              <div className="h-4 w-20 bg-white/10 rounded mb-3 animate-pulse" />
              <div className="bg-white/5 rounded-xl p-4 h-[100px] animate-pulse" />
            </div>
            
            {/* Skeleton Equipment Activity */}
            <div className="mb-6">
              <div className="h-4 w-32 bg-white/10 rounded mb-3 animate-pulse" />
              <div className="bg-white/5 rounded-xl p-4 h-[150px] animate-pulse" />
            </div>
            
            {/* Skeleton Recent Activity */}
            <div>
              <div className="h-4 w-28 bg-white/10 rounded mb-3 animate-pulse" />
              <div className="bg-white/5 rounded-xl min-h-[280px] animate-pulse" />
            </div>
          </>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="text-white/40">Failed to load history</div>
            <button
              onClick={() => fetchHistory(timeRange, endDate)}
              className="px-4 py-2 bg-white/10 rounded-lg text-white/70 active:bg-white/20"
            >
              Retry
            </button>
          </div>
        ) : history && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <StatCard
                label="Pool Runtime"
                value={formatRuntime(poolRuntime)}
                subValue={TIME_RANGES.find(r => r.value === timeRange)?.label}
                color="#00d2d3"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M2 12c2-2 4-3 6-3s4 1 6 3 4 3 6 3 4-1 6-3" />
                    <path d="M2 18c2-2 4-3 6-3s4 1 6 3 4 3 6 3 4-1 6-3" />
                  </svg>
                }
              />
              <StatCard
                label="Heater Runtime"
                value={formatRuntime(heaterRuntime)}
                subValue={solarRuntime > 0 ? `+ ${formatRuntime(solarRuntime)} solar` : 'Gas only'}
                color="#ff453a"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" />
                  </svg>
                }
              />
              <StatCard
                label="Air Temp"
                value={airRange.min > 0 ? `${airRange.min}° - ${airRange.max}°` : '--'}
                subValue="Range"
                color="#ffffff"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
                  </svg>
                }
              />
              <StatCard
                label="Pool Temp"
                value={poolRange.min > 0 ? `${poolRange.min}° - ${poolRange.max}°` : '--'}
                subValue="Range"
                color="#00d2d3"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
                  </svg>
                }
              />
            </div>

            {/* Temperature Chart */}
            <div className="mb-6">
              <h2 className="text-[13px] font-semibold text-white/35 uppercase tracking-wider mb-3">Temperature</h2>
              <div className="bg-white/5 rounded-xl p-4 relative overflow-hidden">
                {/* Time grid overlay - only on the chart */}
                {mounted && <TimeGrid endDate={endDate} timeRange={timeRange} isDragging={isDragging} />}
                <TempChart
                  airTemps={history.airTemps}
                  poolTemps={history.poolTemps}
                  spaTemps={history.spaTemps}
                  poolRuns={history.poolRuns}
                  spaRuns={history.spaRuns}
                  viewStart={viewStart}
                  viewEnd={viewEnd}
                />
                {/* Loading overlay on chart */}
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] rounded-xl">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded-full border border-cyan-500/30">
                      <div className="relative w-4 h-4">
                        <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30" />
                        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" />
                      </div>
                      <span className="text-[11px] text-cyan-400/80">Loading...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Longitudinal Timeline */}
            <div className="mb-6">
              <h2 className="text-[13px] font-semibold text-white/35 uppercase tracking-wider mb-3">Timeline</h2>
              <div className="bg-white/5 rounded-xl p-4">
                <LongitudinalTimeline 
                  history={history} 
                  viewStart={viewStart}
                  viewEnd={viewEnd}
                />
              </div>
            </div>

            {/* Equipment Timeline - Compressed */}
            <div className="mb-6">
              <h2 className="text-[13px] font-semibold text-white/35 uppercase tracking-wider mb-3">Equipment Activity</h2>
              <div className="bg-white/5 rounded-xl p-4">
                <CompressedTimeline 
                  history={history} 
                  viewStart={viewStart}
                  viewEnd={viewEnd}
                />
              </div>
            </div>

            {/* Recent Activity - fixed height to prevent layout shift */}
            <div>
              <h2 className="text-[13px] font-semibold text-white/35 uppercase tracking-wider mb-3">Recent Activity</h2>
              <div className="bg-white/5 rounded-xl overflow-hidden min-h-[280px]">
                {(() => {
                  // Create typed run entries with labels
                  const allRuns: { run: RunPeriod; type: string; color: string }[] = [
                    ...history.poolRuns.map(r => ({ run: r, type: 'Pool', color: '#00d2d3' })),
                    ...history.spaRuns.map(r => ({ run: r, type: 'Spa', color: '#ff9f0a' })),
                    ...history.heaterRuns.map(r => ({ run: r, type: 'Heater', color: '#ff453a' })),
                    ...history.lightRuns.map(r => ({ run: r, type: 'Lights', color: '#bf5af2' })),
                  ];
                  
                  // Filter to only include runs that overlap with the view window
                  const runsInWindow = allRuns.filter(item => {
                    const onTime = new Date(item.run.on).getTime();
                    const offTime = new Date(item.run.off).getTime();
                    // Run overlaps with window if it starts before window ends AND ends after window starts
                    return onTime < viewEnd && offTime > viewStart;
                  });
                  
                  // Filter out invalid/meaningless entries (duration < 1 minute or negative)
                  const validRuns = runsInWindow.filter(item => {
                    const onTime = new Date(item.run.on).getTime();
                    const offTime = new Date(item.run.off).getTime();
                    const durationMs = offTime - onTime;
                    return durationMs >= 60000; // At least 1 minute
                  });
                  
                  // Round time to minute for dedup key (entries that display the same should be considered duplicates)
                  const roundToMinute = (isoString: string) => {
                    const d = new Date(isoString);
                    d.setSeconds(0, 0);
                    return d.getTime();
                  };
                  
                  // Dedupe by unique on+off+type combination (rounded to minute)
                  const seen = new Set<string>();
                  const deduped = validRuns.filter(item => {
                    const key = `${item.type}-${roundToMinute(item.run.on)}-${roundToMinute(item.run.off)}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                  });
                  
                  return deduped
                    .sort((a, b) => new Date(b.run.on).getTime() - new Date(a.run.on).getTime())
                    .slice(0, 5)
                    .map((item, i) => {
                      const duration = (new Date(item.run.off).getTime() - new Date(item.run.on).getTime()) / (1000 * 60);
                      
                      return (
                        <div key={`${item.type}-${item.run.on}-${item.run.off}`} className="flex items-center justify-between p-4 border-b border-white/5 last:border-0">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full" style={{ background: item.color, boxShadow: `0 0 6px ${item.color}` }} />
                            <div>
                              <div className="text-[14px] font-medium">{item.type}</div>
                              <div className="text-[12px] text-white/35">
                                {formatDate(item.run.on)} · {formatTime(item.run.on)} - {formatTime(item.run.off)}
                              </div>
                            </div>
                          </div>
                          <div className="text-[14px] text-white/50">{formatRuntime(duration)}</div>
                        </div>
                      );
                    });
                })()}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

