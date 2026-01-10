/**
 * Demo mode data service
 * Serves static pool data for demo users, with session-based mutations
 * 
 * Demo mode is activated when:
 * - DEMO_PASSWORD env var is set
 * - User logs in with systemName: "demo" and the demo password
 */

import { 
  PoolStatus, 
  FullConfig, 
  ScheduleData, 
  HistoryData,
} from './screenlogic';

// Session storage keys for demo mutations
const DEMO_CIRCUITS_KEY = 'plunge_demo_circuits';
const DEMO_HEAT_MODES_KEY = 'plunge_demo_heat_modes';
const DEMO_SET_POINTS_KEY = 'plunge_demo_set_points';

// Cache for static demo data (loaded once per server instance)
// In development, we don't cache to allow hot-reloading of demo data
const isDev = process.env.NODE_ENV === 'development';
let statusCache: PoolStatus | null = null;
let configCache: FullConfig | null = null;
let schedulesCache: ScheduleData | null = null;
let historyCache: (HistoryData & { exportedAt: string; rangeStart: string; rangeEnd: string }) | null = null;
let systemCache: { date: Date; adjustForDST: boolean } | null = null;

/**
 * Load static demo data from JSON files
 * In Next.js API routes, these are loaded directly from the filesystem
 */
async function loadDemoData<T>(filename: string): Promise<T> {
  // Use fs to read directly from the public folder (server-side only)
  const fs = await import('fs/promises');
  const path = await import('path');
  
  const filePath = path.join(process.cwd(), 'public', 'demo-data', filename);
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

/**
 * Get demo pool status
 * Merges static data with any session-based circuit/heat changes
 */
export async function getDemoStatus(sessionOverrides?: {
  circuits?: Record<number, boolean>;
  heatModes?: Record<number, number>;
  setPoints?: Record<number, number>;
}): Promise<PoolStatus> {
  if (!statusCache) {
    statusCache = await loadDemoData<PoolStatus>('status.json');
  }
  
  // Clone the cached status
  const status: PoolStatus = JSON.parse(JSON.stringify(statusCache));
  
  // Update timestamp to look fresh
  status.lastUpdated = new Date().toISOString();
  status.connectionType = 'demo';
  
  // Apply circuit overrides from session
  if (sessionOverrides?.circuits) {
    for (const [idStr, state] of Object.entries(sessionOverrides.circuits)) {
      const id = parseInt(idStr, 10);
      const circuit = status.circuits.find(c => c.id === id);
      if (circuit) {
        circuit.state = state;
      }
    }
  }
  
  // Apply heat mode overrides
  if (sessionOverrides?.heatModes) {
    for (const [indexStr, mode] of Object.entries(sessionOverrides.heatModes)) {
      const index = parseInt(indexStr, 10);
      if (status.bodies[index]) {
        status.bodies[index].heatMode = mode;
        // If heat mode is on (1-3), mark as heating
        status.bodies[index].heatStatus = mode > 0;
      }
    }
  }
  
  // Apply set point overrides
  if (sessionOverrides?.setPoints) {
    for (const [indexStr, temp] of Object.entries(sessionOverrides.setPoints)) {
      const index = parseInt(indexStr, 10);
      if (status.bodies[index]) {
        status.bodies[index].setPoint = temp;
      }
    }
  }
  
  return status;
}

/**
 * Get demo configuration
 */
export async function getDemoConfig(): Promise<FullConfig> {
  if (!configCache) {
    configCache = await loadDemoData<FullConfig>('config.json');
  }
  return configCache;
}

/**
 * Get demo schedules
 */
export async function getDemoSchedules(): Promise<ScheduleData> {
  if (!schedulesCache) {
    schedulesCache = await loadDemoData<ScheduleData>('schedules.json');
  }
  return schedulesCache;
}

// Extended history data type with demo metadata
export interface DemoHistoryData extends HistoryData {
  demoDataEnd?: string; // The "now" for demo mode - end of available data
}

/**
 * Get demo history data
 * Returns data as-is (not time-shifted) with demoDataEnd indicating the latest data point
 */
export async function getDemoHistory(fromTime?: Date, toTime?: Date): Promise<DemoHistoryData> {
  // In development, always reload to pick up changes to demo data files
  if (!historyCache || isDev) {
    historyCache = await loadDemoData<HistoryData & { exportedAt: string; rangeStart: string; rangeEnd: string }>('history.json');
  }
  
  // Use the data as-is, with rangeEnd as the "now" for demo purposes
  const demoDataEnd = historyCache.rangeEnd;
  
  // Clone the data
  const result: DemoHistoryData = {
    airTemps: [...historyCache.airTemps],
    poolTemps: [...historyCache.poolTemps],
    spaTemps: [...historyCache.spaTemps],
    poolSetPointTemps: [...historyCache.poolSetPointTemps],
    spaSetPointTemps: [...historyCache.spaSetPointTemps],
    poolRuns: [...historyCache.poolRuns],
    spaRuns: [...historyCache.spaRuns],
    solarRuns: [...historyCache.solarRuns],
    heaterRuns: [...historyCache.heaterRuns],
    lightRuns: [...historyCache.lightRuns],
    demoDataEnd,
  };
  
  // Filter to requested time range if provided
  if (fromTime || toTime) {
    const from = fromTime?.getTime() || 0;
    const to = toTime?.getTime() || new Date(demoDataEnd).getTime();
    
    const filterTemps = (temps: { time: string; temp: number }[]) => 
      temps.filter(t => {
        const time = new Date(t.time).getTime();
        return time >= from && time <= to;
      });
    
    const filterRuns = (runs: { on: string; off: string }[]) =>
      runs.filter(r => {
        const onTime = new Date(r.on).getTime();
        const offTime = new Date(r.off).getTime();
        // Include if any part of the run overlaps with the range
        return offTime >= from && onTime <= to;
      });
    
    result.airTemps = filterTemps(result.airTemps);
    result.poolTemps = filterTemps(result.poolTemps);
    result.spaTemps = filterTemps(result.spaTemps);
    result.poolSetPointTemps = filterTemps(result.poolSetPointTemps);
    result.spaSetPointTemps = filterTemps(result.spaSetPointTemps);
    result.poolRuns = filterRuns(result.poolRuns);
    result.spaRuns = filterRuns(result.spaRuns);
    result.solarRuns = filterRuns(result.solarRuns);
    result.heaterRuns = filterRuns(result.heaterRuns);
    result.lightRuns = filterRuns(result.lightRuns);
  }
  
  return result;
}

/**
 * Get demo system time
 */
export async function getDemoSystemTime(): Promise<{ date: Date; adjustForDST: boolean }> {
  if (!systemCache) {
    const data = await loadDemoData<{ date: string; adjustForDST: boolean }>('system.json');
    systemCache = {
      date: new Date(), // Always return current time
      adjustForDST: data.adjustForDST,
    };
  }
  
  // Return current time for demo
  return {
    date: new Date(),
    adjustForDST: systemCache.adjustForDST,
  };
}

/**
 * Get demo pump status
 * Returns pump data from the cached config
 */
export async function getDemoPumpStatus(pumpId: number): Promise<{
  pumpId: number;
  isRunning: boolean;
  watts: number;
  rpm: number;
  gpm: number;
} | null> {
  const config = await getDemoConfig();
  const pump = config.equipment.pumps.find(p => p.pumpId === pumpId);
  
  if (!pump) return null;
  
  return {
    pumpId: pump.pumpId,
    isRunning: pump.isRunning,
    watts: pump.watts,
    rpm: pump.rpm,
    gpm: pump.gpm,
  };
}

/**
 * Demo mutation handlers
 * These don't actually persist - they return success and the client
 * stores changes in sessionStorage
 */

export async function setDemoCircuitState(circuitId: number, state: boolean): Promise<void> {
  // In demo mode, we just acknowledge the request
  // The client will store this in sessionStorage
  console.log(`[Demo] Circuit ${circuitId} set to ${state}`);
}

export async function setDemoHeatMode(bodyIndex: number, mode: number): Promise<void> {
  console.log(`[Demo] Body ${bodyIndex} heat mode set to ${mode}`);
}

export async function setDemoBodyTemperature(bodyIndex: number, temp: number): Promise<void> {
  console.log(`[Demo] Body ${bodyIndex} temperature set to ${temp}`);
}

export async function sendDemoLightCommand(command: number): Promise<void> {
  console.log(`[Demo] Light command ${command} sent`);
}

export async function cancelDemoDelay(): Promise<void> {
  console.log(`[Demo] Delay cancelled`);
}

// Schedule mutations (demo mode doesn't persist these)
export async function createDemoSchedule(): Promise<number> {
  console.log(`[Demo] Schedule created`);
  return 999; // Fake schedule ID
}

export async function updateDemoSchedule(scheduleId: number): Promise<void> {
  console.log(`[Demo] Schedule ${scheduleId} updated`);
}

export async function deleteDemoSchedule(scheduleId: number): Promise<void> {
  console.log(`[Demo] Schedule ${scheduleId} deleted`);
}
