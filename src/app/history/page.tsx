'use client';

import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
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
  demoDataEnd?: string; // For demo mode - the "now" timestamp
}

const CREDENTIALS_KEY = 'plunge_credentials';
const HISTORY_CACHE_KEY = 'plunge_history_cache';

// Persistent cache for history data
interface PersistedHistoryCache {
  timeRange: TimeRange;
  dataStart: number;
  dataEnd: number;
  data: HistoryData;
  timestamp: number;
}

function loadHistoryCache(): PersistedHistoryCache | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(HISTORY_CACHE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
}

function saveHistoryCache(cache: PersistedHistoryCache): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(cache));
}

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
  if (minutes < 1) return '0';
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
  timeRange,
  isDragging,
}: { 
  airTemps: TempPoint[]; 
  poolTemps: TempPoint[]; 
  spaTemps: TempPoint[];
  poolRuns: RunPeriod[];
  spaRuns: RunPeriod[];
  viewStart: number; // timestamp for left edge of view
  viewEnd: number;   // timestamp for right edge of view
  timeRange: TimeRange;
  isDragging?: boolean;
}) {
  // Filter data to view window, but include one point before and after
  // so lines extend to the edges naturally (only if within reasonable distance)
  const filterToViewWindowWithBoundary = (temps: TempPoint[], extendedBoundary: boolean = false): TempPoint[] => {
    if (temps.length === 0) return [];
    
    // Max distance outside view to include a boundary point
    // For air temp in 24h view, use 2 hours; otherwise use 1 hour
    const maxBoundaryDistance = (extendedBoundary && timeRange === '24h') 
      ? 2 * 60 * 60 * 1000 
      : 60 * 60 * 1000;
    
    // Sort by time first
    const sorted = [...temps].sort((a, b) => 
      new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    
    // Find indices of boundary points
    let firstInViewIdx = sorted.findIndex(t => new Date(t.time).getTime() >= viewStart);
    if (firstInViewIdx === -1) firstInViewIdx = sorted.length;
    
    let lastInViewIdx = -1;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (new Date(sorted[i].time).getTime() <= viewEnd) {
        lastInViewIdx = i;
        break;
      }
    }
    
    // Determine start index - include one before if close enough
    let startIdx = firstInViewIdx;
    if (firstInViewIdx > 0) {
      const prevPointTime = new Date(sorted[firstInViewIdx - 1].time).getTime();
      if (viewStart - prevPointTime <= maxBoundaryDistance) {
        startIdx = firstInViewIdx - 1;
      }
    }
    
    // Determine end index - include one after if close enough
    let endIdx = lastInViewIdx;
    if (lastInViewIdx < sorted.length - 1 && lastInViewIdx >= 0) {
      const nextPointTime = new Date(sorted[lastInViewIdx + 1].time).getTime();
      if (nextPointTime - viewEnd <= maxBoundaryDistance) {
        endIdx = lastInViewIdx + 1;
      }
    }
    
    // Handle edge cases
    if (startIdx > endIdx || endIdx < 0) return [];
    
    return sorted.slice(startIdx, endIdx + 1);
  };

  const filteredAirTemps = filterToViewWindowWithBoundary(airTemps, true);  // Extended boundary for air
  const filteredPoolTemps = filterToViewWindowWithBoundary(poolTemps, false);
  const filteredSpaTemps = filterToViewWindowWithBoundary(spaTemps, false);

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

  // Create path for each run period - extends to run boundaries
  const createRunOnlyPath = (temps: TempPoint[], runs: RunPeriod[]): string => {
    if (temps.length === 0 || runs.length === 0) return '';
    const sorted = [...temps].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    
    const paths: string[] = [];
    
    for (const run of runs) {
      const runStart = Math.max(new Date(run.on).getTime(), viewStart);
      const runEnd = Math.min(new Date(run.off).getTime(), viewEnd);
      
      // Skip runs outside view window
      if (runEnd <= runStart) continue;
      
      // Get points during this specific run
      const runPoints = sorted.filter(p => {
        const t = new Date(p.time).getTime();
        return t >= new Date(run.on).getTime() && t <= new Date(run.off).getTime();
      });
      
      if (runPoints.length === 0) continue;
      
      // Build path: extend from run start, through data points, to run end
      const pathParts: string[] = [];
      
      // Start at run boundary with first point's temperature
      const firstPoint = runPoints[0];
      const firstPointTime = new Date(firstPoint.time).getTime();
      if (firstPointTime > runStart) {
        // Extend horizontally from run start to first data point
        pathParts.push(`M ${toX(new Date(runStart).toISOString())} ${toY(firstPoint.temp)}`);
        pathParts.push(`L ${toX(firstPoint.time)} ${toY(firstPoint.temp)}`);
      } else {
        pathParts.push(`M ${toX(firstPoint.time)} ${toY(firstPoint.temp)}`);
      }
      
      // Add all intermediate points
      for (let i = 1; i < runPoints.length; i++) {
        pathParts.push(`L ${toX(runPoints[i].time)} ${toY(runPoints[i].temp)}`);
      }
      
      // Extend to run end with last point's temperature
      const lastPoint = runPoints[runPoints.length - 1];
      const lastPointTime = new Date(lastPoint.time).getTime();
      if (lastPointTime < runEnd) {
        pathParts.push(`L ${toX(new Date(runEnd).toISOString())} ${toY(lastPoint.temp)}`);
      }
      
      paths.push(pathParts.join(' '));
    }
    
    return paths.join(' ');
  };

  // Create area paths (for gradient fill) - separate path for each run period, extends to run boundaries
  const createAreaPath = (temps: TempPoint[], runs: RunPeriod[]): string => {
    if (temps.length === 0 || runs.length === 0) return '';
    const sorted = [...temps].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    
    // Create a separate closed area for each run period
    const areaPaths: string[] = [];
    
    for (const run of runs) {
      const runStart = Math.max(new Date(run.on).getTime(), viewStart);
      const runEnd = Math.min(new Date(run.off).getTime(), viewEnd);
      
      // Skip runs outside view window
      if (runEnd <= runStart) continue;
      
      // Get points during this specific run
      const runPoints = sorted.filter(p => {
        const t = new Date(p.time).getTime();
        return t >= new Date(run.on).getTime() && t <= new Date(run.off).getTime();
      });
      
      if (runPoints.length === 0) continue;
      
      // Build area path: extend from run start, through data points, to run end
      const pathParts: string[] = [];
      
      // Start at run boundary with first point's temperature
      const firstPoint = runPoints[0];
      const firstPointTime = new Date(firstPoint.time).getTime();
      const effectiveStart = Math.max(runStart, viewStart);
      
      if (firstPointTime > effectiveStart) {
        // Extend horizontally from run start to first data point
        pathParts.push(`M ${toX(new Date(effectiveStart).toISOString())} ${toY(firstPoint.temp)}`);
        pathParts.push(`L ${toX(firstPoint.time)} ${toY(firstPoint.temp)}`);
      } else {
        pathParts.push(`M ${toX(firstPoint.time)} ${toY(firstPoint.temp)}`);
      }
      
      // Add all intermediate points
      for (let i = 1; i < runPoints.length; i++) {
        pathParts.push(`L ${toX(runPoints[i].time)} ${toY(runPoints[i].temp)}`);
      }
      
      // Extend to run end with last point's temperature
      const lastPoint = runPoints[runPoints.length - 1];
      const lastPointTime = new Date(lastPoint.time).getTime();
      const effectiveEnd = Math.min(runEnd, viewEnd);
      
      if (lastPointTime < effectiveEnd) {
        pathParts.push(`L ${toX(new Date(effectiveEnd).toISOString())} ${toY(lastPoint.temp)}`);
      }
      
      // Close the area path - go down to bottom, across, and back up
      const startX = firstPointTime > effectiveStart 
        ? toX(new Date(effectiveStart).toISOString())
        : toX(firstPoint.time);
      const endX = lastPointTime < effectiveEnd
        ? toX(new Date(effectiveEnd).toISOString())
        : toX(lastPoint.time);
      
      pathParts.push(`L ${endX} 100 L ${startX} 100 Z`);
      
      areaPaths.push(pathParts.join(' '));
    }
    
    return areaPaths.join(' ');
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

  // Get paths for pool and spa - only draw during runs
  const poolPath = createRunOnlyPath(filteredPoolTemps, poolRuns);
  const spaPath = createRunOnlyPath(filteredSpaTemps, spaRuns);

  return (
    <div>
      {/* Chart */}
      <div className="relative h-[200px]">
        {/* Time grid - rendered first so it's behind the chart lines */}
        <TimeGrid viewStart={viewStart} viewEnd={viewEnd} timeRange={timeRange} isDragging={isDragging} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full relative z-10">
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
          
          {/* Lines - air temp is continuous, pool/spa only during runs */}
          {filteredAirTemps.length > 0 && (
            <path d={createPath(filteredAirTemps)} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
          )}
          {/* Pool line - only when pump is ON */}
          {poolPath && (
            <path d={poolPath} fill="none" stroke="#00d2d3" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          )}
          {/* Spa line - only when pump is ON */}
          {spaPath && (
            <path d={spaPath} fill="none" stroke="#ff9f0a" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
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
      {/* Timeline rows */}
      <div className="relative" style={{ height: types.length * (rowHeight + rowGap) }}>
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
              <span className="absolute left-2 text-[10px] font-medium text-white/50 z-10">
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
function TimeGrid({ viewStart, viewEnd, timeRange, isDragging }: { viewStart: number; viewEnd: number; timeRange: TimeRange; isDragging?: boolean }) {
  const viewSpan = viewEnd - viewStart;
  
  // Determine grid interval based on time range
  let intervalMs: number;
  let formatLabel: (d: Date) => string;
  let isMajorLine: (d: Date) => boolean;
  
  if (timeRange === '24h') {
    intervalMs = 2 * 60 * 60 * 1000; // Every 2 hours
    formatLabel = (d) => {
      const hour = d.getHours();
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      return `${hour12}${ampm}`;
    };
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
  // Start with null - will load from cache in useEffect (avoids hydration mismatch)
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [endDate, setEndDate] = useState<Date>(() => new Date());
  const endDateRef = useRef<Date>(endDate); // Track latest endDate for use in callbacks
  const [isDragging, setIsDragging] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Demo mode: track the "now" from demo data (end of available data)
  const [demoNow, setDemoNow] = useState<Date | null>(null);
  const demoInitializedRef = useRef(false);
  
  // Helper to get the effective "now" - use demoNow if in demo mode, otherwise real now
  const getNow = useCallback(() => demoNow || new Date(), [demoNow]);
  
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
  
  // Track if we've loaded cache
  const cacheCheckedRef = useRef(false);
  
  // Load cache on mount - useLayoutEffect runs before paint
  useLayoutEffect(() => {
    if (cacheCheckedRef.current) return;
    cacheCheckedRef.current = true;

    const persistedCache = loadHistoryCache();
    if (persistedCache && persistedCache.timeRange === '24h') {
      cacheRef.current = {
        timeRange: persistedCache.timeRange,
        dataStart: persistedCache.dataStart,
        dataEnd: persistedCache.dataEnd,
        data: persistedCache.data,
      };
      setHistory(persistedCache.data);
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async (range: TimeRange, end: Date, forceRefresh: boolean | 'background' = false) => {
    const isBackgroundRefresh = forceRefresh === 'background';
    const shouldForceRefresh = forceRefresh === true;
    
    const rangeConfig = TIME_RANGES.find(r => r.value === range);
    const hours = rangeConfig?.hours || 24;
    const viewEnd = end.getTime();
    const viewStart = viewEnd - hours * 60 * 60 * 1000;
    
    // Check cache - if we have data covering the view window, use it (unless forcing refresh)
    let cache = cacheRef.current;
    if (!shouldForceRefresh && !isBackgroundRefresh && cache && cache.timeRange === range) {
      // Check if cache covers the view window (with some tolerance for edge cases)
      const tolerance = 5 * 60 * 1000; // 5 minutes tolerance
      const cacheCoversView = cache.dataStart <= viewStart + tolerance && cache.dataEnd >= viewEnd - tolerance;
      
      if (cacheCoversView) {
        setHistory(cache.data);
        setLoading(false);
        return;
      }
      
      // If view is completely outside cache range (more than 1 range away), clear cache and fetch fresh
      const rangeMs = hours * 60 * 60 * 1000;
      if (viewEnd < cache.dataStart - rangeMs || viewStart > cache.dataEnd + rangeMs) {
        cacheRef.current = null;
        cache = null; // Also clear local reference
      }
    }
    
    // Request the exact view window - server-side adds buffer for controller quirks
    let fetchStart = viewStart;
    let fetchEnd = viewEnd;
    
    // If we have cache, only fetch what we're missing (extend in the needed direction)
    if (!shouldForceRefresh && cache && cache.timeRange === range) {
      if (viewStart < cache.dataStart && viewEnd <= cache.dataEnd) {
        // Need earlier data - fetch from new start to cache start
        fetchEnd = cache.dataStart;
      } else if (viewEnd > cache.dataEnd && viewStart >= cache.dataStart) {
        // Need later data - fetch from cache end to new end
        fetchStart = cache.dataEnd;
      }
    }
    
    isFetchingRef.current = true;
    // Don't show loading indicator for background refreshes
    if (!isBackgroundRefresh) {
      setLoading(true);
    }
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
      
      // Check for demo mode - if demoDataEnd is present, set it as the "now"
      if (newData.demoDataEnd) {
        const demoEnd = new Date(newData.demoDataEnd);
        setDemoNow(demoEnd);
        // On first load in demo mode, set endDate to the demo data end (only once)
        if (!demoInitializedRef.current) {
          demoInitializedRef.current = true;
          setEndDate(demoEnd);
          endDateRef.current = demoEnd;
        }
      }
      
      // Merge with existing cache if same time range
      let mergedData: HistoryData;
      if (!shouldForceRefresh && cache && cache.timeRange === range) {
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
      
      // Persist 24h cache to localStorage for instant load on navigation
      if (range === '24h') {
        saveHistoryCache({
          timeRange: range,
          dataStart,
          dataEnd,
          data: mergedData,
          timestamp: Date.now(),
        });
      }
      
      setHistory(mergedData);
      setError(null);
    } catch (err) {
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

  // Initial fetch on mount - refresh in background if we have cached data
  useEffect(() => {
    const hasCachedData = cacheRef.current !== null;
    // If we have cached data, fetch in background without loading indicator
    // Otherwise show loading while fetching
    if (hasCachedData) {
      // Background refresh - don't show loading, will update data silently
      fetchHistory(timeRange, endDate, 'background');
    } else {
      fetchHistory(timeRange, endDate);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTimeRangeChange = (range: TimeRange) => {
    // Clear cache when switching time ranges (different data density)
    if (range !== timeRange) {
      cacheRef.current = null;
    }
    setTimeRange(range);
    fetchHistory(range, endDate);
  };

  // Navigate backward/forward by the current time range
  const navigateTime = (direction: 'back' | 'forward') => {
    const rangeConfig = TIME_RANGES.find(r => r.value === timeRange);
    const hours = rangeConfig?.hours || 24;
    const deltaMs = hours * 60 * 60 * 1000;
    
    const newEndDate = new Date(endDate.getTime() + (direction === 'forward' ? deltaMs : -deltaMs));
    
    // Don't allow navigating into the future (use demoNow in demo mode)
    const now = getNow();
    if (newEndDate > now) {
      setEndDate(now);
      endDateRef.current = now;
      fetchHistory(timeRange, now);
    } else {
      setEndDate(newEndDate);
      endDateRef.current = newEndDate;
      fetchHistory(timeRange, newEndDate);
    }
  };

  // Refs for drag state to avoid stale closures
  const timeRangeRef = useRef(timeRange);
  timeRangeRef.current = timeRange;
  
  const debouncedFetchRef = useRef(debouncedFetch);
  debouncedFetchRef.current = debouncedFetch;
  
  const getNowRef = useRef(getNow);
  getNowRef.current = getNow;

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    dragRef.current = { startX: e.touches[0].clientX, startEndDate: new Date(endDateRef.current) };
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current || !containerRef.current) return;
    
    const deltaX = dragRef.current.startX - e.touches[0].clientX;
    const containerWidth = containerRef.current.offsetWidth;
    const rangeConfig = TIME_RANGES.find(r => r.value === timeRangeRef.current);
    const hours = rangeConfig?.hours || 24;
    
    const msPerPixel = (hours * 60 * 60 * 1000) / containerWidth;
    const deltaMs = deltaX * msPerPixel;
    
    const newEndDate = new Date(dragRef.current.startEndDate.getTime() + deltaMs);
    const now = getNowRef.current();
    const clampedDate = newEndDate > now ? now : newEndDate;
    
    setEndDate(clampedDate);
    endDateRef.current = clampedDate;
    debouncedFetchRef.current(timeRangeRef.current, clampedDate);
  };

  const handleTouchEnd = () => {
    if (dragRef.current) {
      debouncedFetchRef.current(timeRangeRef.current, endDateRef.current);
    }
    dragRef.current = null;
    setIsDragging(false);
  };

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startEndDate: new Date(endDateRef.current) };
    setIsDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      
      const deltaX = dragRef.current.startX - e.clientX;
      const containerWidth = containerRef.current.offsetWidth;
      const rangeConfig = TIME_RANGES.find(r => r.value === timeRangeRef.current);
      const hours = rangeConfig?.hours || 24;
      
      const msPerPixel = (hours * 60 * 60 * 1000) / containerWidth;
      const deltaMs = deltaX * msPerPixel;
      
      const newEndDate = new Date(dragRef.current.startEndDate.getTime() + deltaMs);
      const now = getNowRef.current();
      const clampedDate = newEndDate > now ? now : newEndDate;
      
      setEndDate(clampedDate);
      endDateRef.current = clampedDate;
      debouncedFetchRef.current(timeRangeRef.current, clampedDate);
    };
    
    const handleMouseUp = () => {
      if (dragRef.current) {
        debouncedFetchRef.current(timeRangeRef.current, endDateRef.current);
      }
      dragRef.current = null;
      setIsDragging(false);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Format the date range for display
  const formatDateRange = () => {
    const rangeConfig = TIME_RANGES.find(r => r.value === timeRange);
    const hours = rangeConfig?.hours || 24;
    const fromTime = new Date(endDate.getTime() - hours * 60 * 60 * 1000);
    
    const formatDate = (d: Date) => {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    const formatTimeStr = (d: Date) => {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    };
    
    if (timeRange === '24h') {
      return `${formatDate(fromTime)} ${formatTimeStr(fromTime)} - ${formatDate(endDate)} ${formatTimeStr(endDate)}`;
    }
    return `${formatDate(fromTime)} - ${formatDate(endDate)}`;
  };
  
  const isAtPresent = endDate.getTime() >= getNow().getTime() - 60000;

  // Calculate view window based on endDate
  const rangeHours = TIME_RANGES.find(r => r.value === timeRange)?.hours || 24;
  const viewEnd = endDate.getTime();
  const viewStart = viewEnd - rangeHours * 60 * 60 * 1000;

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
      <header className="sticky top-0 z-50 bg-black/95 backdrop-blur-xl border-b border-white/10">
        {/* Title Row */}
        <div className="flex items-center px-5 pt-4 pb-3">
          <h1 className="text-[32px] font-semibold tracking-tight leading-none">History</h1>
        </div>
        
        {/* Time Range Selector with Navigation */}
        <div className="flex items-center justify-center gap-3 px-4 pb-2">
          {/* Back chevron */}
          <button
            onClick={() => navigateTime('back')}
            className="p-2 rounded-full bg-white/10 text-white/60 hover:bg-white/15 hover:text-white/80 transition-colors active:scale-95"
            aria-label={`Go back ${timeRange}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          
          {/* Time range buttons */}
          <div className="flex gap-1">
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
          
          {/* Forward chevron */}
          <button
            onClick={() => navigateTime('forward')}
            disabled={isAtPresent}
            className={`p-2 rounded-full transition-colors active:scale-95 ${
              isAtPresent 
                ? 'bg-white/5 text-white/20 cursor-not-allowed' 
                : 'bg-white/10 text-white/60 hover:bg-white/15 hover:text-white/80'
            }`}
            aria-label={`Go forward ${timeRange}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
        
        {/* Date Range Display */}
        <div className="flex items-center justify-center gap-2 px-4 pb-3">
          <span className="text-[13px] text-white/50">{formatDateRange()}</span>
          {!isAtPresent && (
            <button
              onClick={() => {
                const now = getNow();
                setEndDate(now);
                endDateRef.current = now;
                // Force refresh when jumping to now to get latest data (unless in demo mode)
                fetchHistory(timeRange, now, !demoNow);
              }}
              className="text-[11px] text-cyan-400 px-2 py-0.5 rounded-full bg-cyan-500/10"
            >
              {demoNow ? 'Jump to Latest' : 'Jump to Now'}
            </button>
          )}
        </div>
      </header>

      <div 
        ref={containerRef}
        className="px-5 py-4 select-none relative"
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
              <div className="bg-white/5 rounded-xl p-4 overflow-hidden relative">
                <TempChart
                  airTemps={history.airTemps}
                  poolTemps={history.poolTemps}
                  spaTemps={history.spaTemps}
                  poolRuns={history.poolRuns}
                  spaRuns={history.spaRuns}
                  viewStart={viewStart}
                  viewEnd={viewEnd}
                  timeRange={timeRange}
                  isDragging={isDragging}
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
                  
                  // Merge overlapping/adjacent runs of the same type into continuous periods
                  const mergeOverlappingRuns = (runs: { run: RunPeriod; type: string; color: string }[]): { run: RunPeriod; type: string; color: string }[] => {
                    if (runs.length === 0) return [];
                    
                    // Group by type
                    const byType = new Map<string, { run: RunPeriod; type: string; color: string }[]>();
                    runs.forEach(item => {
                      const existing = byType.get(item.type) || [];
                      existing.push(item);
                      byType.set(item.type, existing);
                    });
                    
                    const merged: { run: RunPeriod; type: string; color: string }[] = [];
                    
                    // Merge overlapping runs for each type
                    byType.forEach((items, type) => {
                      // Sort by start time
                      const sorted = items.sort((a, b) => 
                        new Date(a.run.on).getTime() - new Date(b.run.on).getTime()
                      );
                      
                      let current = sorted[0];
                      
                      for (let i = 1; i < sorted.length; i++) {
                        const next = sorted[i];
                        const currentEnd = new Date(current.run.off).getTime();
                        const nextStart = new Date(next.run.on).getTime();
                        const nextEnd = new Date(next.run.off).getTime();
                        
                        // If next run starts before or within 2 minutes of current end, merge them
                        if (nextStart <= currentEnd + 120000) {
                          // Extend current run to the later of the two end times
                          current = {
                            ...current,
                            run: {
                              on: current.run.on,
                              off: nextEnd > currentEnd ? next.run.off : current.run.off,
                            },
                          };
                        } else {
                          // No overlap - save current and start new
                          merged.push(current);
                          current = next;
                        }
                      }
                      
                      // Don't forget the last one
                      merged.push(current);
                    });
                    
                    return merged;
                  };
                  
                  const deduped = mergeOverlappingRuns(validRuns);
                  
                  return deduped
                    .sort((a, b) => new Date(b.run.on).getTime() - new Date(a.run.on).getTime())
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
        <button className="nav-item active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-6"/></svg>
          <span>History</span>
        </button>
        <Link href="/settings" className="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>Settings</span>
        </Link>
      </nav>
    </div>
  );
}

