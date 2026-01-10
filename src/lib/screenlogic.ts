/**
 * ScreenLogic connection wrapper for Next.js
 * Supports both local WiFi and remote cloud connections
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ScreenLogic = require('node-screenlogic');

// Connection tracking for debugging
let connectionCounter = 0;
const activeConnections = new Map<number, { type: string; startTime: Date }>();

// Connection semaphore - only one connection at a time
// The pool controller can only handle 1 connection reliably
let connectionLock: Promise<void> = Promise.resolve();
let currentConnections = 0;

// Queue timeout - don't wait forever for a slot
const QUEUE_TIMEOUT_MS = 10000; // 10 seconds max wait

function acquireConnectionSlot(): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Connection queue timeout - too many pending requests'));
    }, QUEUE_TIMEOUT_MS);
    
    // Create a release function for this specific connection
    let releaseThis: () => void;
    const releasePromise = new Promise<void>((r) => { releaseThis = r; });
    
    // Chain onto the lock
    const previousLock = connectionLock;
    connectionLock = previousLock
      .then(() => {
        clearTimeout(timeoutId);
        currentConnections++;
        // Resolve with the release function
        resolve(releaseThis!);
        // Wait for this connection to be released before allowing next
        return releasePromise;
      })
      .catch(() => {
        // Previous connection errored, still allow this one
        clearTimeout(timeoutId);
        currentConnections++;
        resolve(releaseThis!);
        return releasePromise;
      });
  });
}

function releaseConnectionSlot(releaseFn: () => void): void {
  currentConnections = Math.max(0, currentConnections - 1);
  releaseFn();
}

// Reset connection state - call this if things get stuck
function resetConnectionState(): void {
  currentConnections = 0;
  connectionLock = Promise.resolve();
  activeConnections.clear();
  log('Connection state reset');
}

function log(message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const activeCount = activeConnections.size;
  const pending = currentConnections;
  console.log(`[ScreenLogic ${timestamp}] [Active: ${activeCount}] [Pending: ${pending}] ${message}`, data ? JSON.stringify(data) : '');
}

export interface PoolBody {
  bodyType: number;
  name: string;
  currentTemp: number;
  setPoint: number;
  heatMode: number;
  heatStatus: boolean;
}

export interface Circuit {
  id: number;
  name: string;
  state: boolean;
  circuitFunction: number;
}

export interface PoolStatus {
  connected: boolean;
  lastUpdated: string;
  airTemp: number;
  bodies: PoolBody[];
  circuits: Circuit[];
  freezeMode: boolean;
  connectionType: 'local' | 'remote';
  pumpIds?: number[]; // Available pump IDs from equipment config
  // Delay states (true when off-delay is active)
  poolDelay?: boolean;
  spaDelay?: boolean;
  cleanerDelay?: boolean;
}

export interface PumpStatus {
  pumpId: number;
  isRunning: boolean;
  watts: number;
  rpm: number;
  gpm: number;
}

export interface LocalUnit {
  address: string;
  port: number;
  gatewayName: string;
  gatewayType: number;
}

export interface ConnectionInfo {
  type: 'local' | 'remote';
  systemName: string;
  address?: string;
  port?: number;
  gatewayName?: string;
}

export interface Credentials {
  systemName: string;
  password: string;
}

const HEAT_MODES: Record<number, string> = {
  0: 'off',
  1: 'solar',
  2: 'solar-preferred',
  3: 'heater',
  4: 'unchanged'
};

export function getHeatModeName(mode: number): string {
  return HEAT_MODES[mode] || 'unknown';
}

export function getHeatModeValue(name: string): number {
  const entry = Object.entries(HEAT_MODES).find(([, v]) => v === name);
  return entry ? parseInt(entry[0]) : 0;
}

// Cache for connection info to avoid repeated discovery
let cachedConnectionInfo: ConnectionInfo | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Clear cache on module load to ensure fresh discovery
cachedConnectionInfo = null;
cacheExpiry = 0;

/**
 * Get credentials from request or fall back to env vars
 * If request credentials are provided, they are used exclusively (no fallback)
 * This ensures credential validation works correctly
 */
export function getCredentials(requestCredentials?: Credentials): Credentials {
  // If request credentials are provided, use them exclusively (no fallback)
  // This is important for credential validation - we don't want to silently
  // fall back to env vars when the user provides wrong credentials
  if (requestCredentials?.systemName && requestCredentials?.password) {
    return requestCredentials;
  }
  
  // No request credentials - fall back to env vars
  const systemName = process.env.POOL_SYSTEM_NAME;
  const password = process.env.POOL_PASSWORD;

  if (!systemName || !password) {
    throw new Error('Pool credentials not configured');
  }

  return { systemName, password };
}

/**
 * Discover local ScreenLogic units on the network
 */
export async function discoverLocalUnits(timeoutMs = 5000): Promise<LocalUnit[]> {
  return new Promise((resolve) => {
    try {
      const finder = new ScreenLogic.FindUnits();
      const units: LocalUnit[] = [];
      
      finder.on('serverFound', (server: any) => {
        units.push({
          address: server.address,
          port: server.port,
          gatewayName: server.gatewayName,
          gatewayType: server.gatewayType
        });
      });

      finder.search();
      
      setTimeout(() => {
        finder.close();
        resolve(units);
      }, timeoutMs);
    } catch (err) {
      log(`Local discovery error`, { error: (err as Error).message });
      resolve([]);
    }
  });
}

/**
 * Get connection info - tries local first, falls back to remote
 * Caches result to avoid repeated discovery
 */
export async function getConnectionInfo(credentials: Credentials, skipLocalDiscovery = false): Promise<ConnectionInfo> {
  // Return cached info if still valid
  if (cachedConnectionInfo && Date.now() < cacheExpiry) {
    return cachedConnectionInfo;
  }

  // Skip local discovery if requested (faster remote connection)
  if (!skipLocalDiscovery) {
    // Try local discovery first - give it enough time to find local units
    const localUnits = await discoverLocalUnits(5000);
    
    if (localUnits.length > 0) {
      // Found local unit - use it
      const unit = localUnits[0];
      log(`Discovered local unit, caching connection`, { address: unit.address, gatewayName: unit.gatewayName });
      cachedConnectionInfo = {
        type: 'local',
        systemName: credentials.systemName,
        address: unit.address,
        port: unit.port,
        gatewayName: unit.gatewayName
      };
      cacheExpiry = Date.now() + CACHE_TTL;
      return cachedConnectionInfo;
    }
  }

  // No local unit found or skipped - use remote
  log(`No local units found, using remote connection`);
  cachedConnectionInfo = {
    type: 'remote',
    systemName: credentials.systemName
  };
  cacheExpiry = Date.now() + CACHE_TTL;
  return cachedConnectionInfo;
}

/**
 * Clear connection cache (useful when switching networks)
 */
export function clearConnectionCache(): void {
  cachedConnectionInfo = null;
  cacheExpiry = 0;
}

// Timeout for history requests (30 days can take 30+ seconds)
const HISTORY_TIMEOUT = 60000; // 60 seconds
const CONNECTION_TIMEOUT = 15000; // 15 seconds for normal connections

/**
 * Create a connected client - handles both local and remote connections
 */
async function createClient(credentials: Credentials, skipLocalDiscovery = false, extendedTimeout = false): Promise<{ client: any; connectionType: 'local' | 'remote'; connectionId: number; release: () => void }> {
  // Wait for a connection slot to prevent overwhelming the controller
  let release: () => void;
  try {
    release = await acquireConnectionSlot();
  } catch (err) {
    // Queue timeout - reset state and try again
    log('Connection queue timeout, resetting state');
    resetConnectionState();
    throw err;
  }
  
  const connectionId = ++connectionCounter;
  log(`Creating connection #${connectionId}`, { skipLocalDiscovery, extendedTimeout });
  
  // Set up a timeout to prevent hung connections from blocking the queue
  const timeout = extendedTimeout ? HISTORY_TIMEOUT : CONNECTION_TIMEOUT;
  
  // Wrap the entire connection process with a timeout
  const connectWithTimeout = async (): Promise<{ client: any; connectionType: 'local' | 'remote'; connectionId: number; release: () => void }> => {
    const connInfo = await getConnectionInfo(credentials, skipLocalDiscovery);
    const client = new ScreenLogic.UnitConnection();
    
    // Extend timeout for long-running operations like history fetches
    if (extendedTimeout) {
      client.netTimeout = HISTORY_TIMEOUT;
    }

    if (connInfo.type === 'local' && connInfo.address && connInfo.port) {
      // Direct local connection
      log(`Connection #${connectionId}: Attempting local connection`, { address: connInfo.address, port: connInfo.port });
      client.init(credentials.systemName, connInfo.address, connInfo.port, credentials.password);
      await client.connectAsync();
      activeConnections.set(connectionId, { type: 'local', startTime: new Date() });
      log(`Connection #${connectionId}: Local connection established`);
      return { client, connectionType: 'local', connectionId, release };
    } else {
      // Remote connection via Pentair cloud
      log(`Connection #${connectionId}: Attempting remote connection via Pentair cloud`);
      const gateway = new ScreenLogic.RemoteLogin(credentials.systemName);
      const unit = await gateway.connectAsync();

      if (!unit || !unit.gatewayFound) {
        log(`Connection #${connectionId}: Gateway not found`);
        throw new Error('Could not find gateway');
      }

      log(`Connection #${connectionId}: Gateway found, closing gateway connection`);
      await gateway.closeAsync().catch(() => {});

      // Check if gateway returned valid connection info
      // If IP is empty, we're likely on the local network - try local discovery
      if (!unit.ipAddr || unit.port === 0) {
        log(`Connection #${connectionId}: Gateway returned empty IP - trying local discovery`);
        clearConnectionCache();
        
        // Try local discovery
        const localUnits = await discoverLocalUnits(5000);
        if (localUnits.length > 0) {
          const localUnit = localUnits[0];
          log(`Connection #${connectionId}: Found local unit, connecting`, { address: localUnit.address, port: localUnit.port });
          
          // Cache the local connection
          cachedConnectionInfo = {
            type: 'local',
            systemName: credentials.systemName,
            address: localUnit.address,
            port: localUnit.port,
            gatewayName: localUnit.gatewayName
          };
          cacheExpiry = Date.now() + CACHE_TTL;
          
          client.init(credentials.systemName, localUnit.address, localUnit.port, credentials.password);
          await client.connectAsync();
          activeConnections.set(connectionId, { type: 'local', startTime: new Date() });
          log(`Connection #${connectionId}: Local connection established (after remote redirect)`);
          return { client, connectionType: 'local', connectionId, release };
        } else {
          throw new Error('Gateway returned empty IP and no local units found');
        }
      }

      log(`Connection #${connectionId}: Connecting to unit`, { ipAddr: unit.ipAddr, port: unit.port });
      client.init(credentials.systemName, unit.ipAddr, unit.port, credentials.password);
      await client.connectAsync();
      activeConnections.set(connectionId, { type: 'remote', startTime: new Date() });
      log(`Connection #${connectionId}: Remote connection established`);
      return { client, connectionType: 'remote', connectionId, release };
    }
  };
  
  // Race the connection against a timeout
  let timeoutId: NodeJS.Timeout | null = null;
  try {
    const result = await Promise.race([
      connectWithTimeout(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          log(`Connection #${connectionId}: Timeout after ${timeout}ms`);
          reject(new Error(`Connection timeout after ${timeout}ms`));
        }, timeout);
      })
    ]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    
    // If local connection failed, try remote
    if ((err as Error).message?.includes('Local connection') || 
        (err as Error).message?.includes('ECONNREFUSED') ||
        (err as Error).message?.includes('ETIMEDOUT')) {
      log(`Connection #${connectionId}: Local connection failed, trying remote`, { error: (err as Error).message });
      clearConnectionCache();
      releaseConnectionSlot(release);
      return createClient(credentials, true, extendedTimeout);
    }
    
    // Release slot on any error
    releaseConnectionSlot(release);
    throw err;
  }
}

/**
 * Close a client connection with logging
 */
async function closeClient(client: any, connectionId: number, release: () => void): Promise<void> {
  const connInfo = activeConnections.get(connectionId);
  const duration = connInfo ? Date.now() - connInfo.startTime.getTime() : 0;
  log(`Connection #${connectionId}: Closing`, { durationMs: duration });
  
  try {
    await client.closeAsync();
    activeConnections.delete(connectionId);
    log(`Connection #${connectionId}: Closed successfully`);
  } catch (err) {
    activeConnections.delete(connectionId);
    log(`Connection #${connectionId}: Error during close`, { error: (err as Error).message });
  } finally {
    // Release the connection slot for the next queued request
    releaseConnectionSlot(release);
  }
}

/**
 * Connect to pool and get status
 */
export async function getPoolStatus(requestCredentials?: Credentials): Promise<PoolStatus> {
  log('getPoolStatus: Starting');
  const credentials = getCredentials(requestCredentials);
  const { client, connectionType, connectionId, release } = await createClient(credentials);

  try {
    log(`getPoolStatus: Fetching equipment state (connection #${connectionId})`);
    const state = await client.equipment.getEquipmentStateAsync();

    const bodies: PoolBody[] = (state.bodies || []).map((body: any, i: number) => ({
      bodyType: body.bodyType,
      name: body.name || (i === 0 ? 'Pool' : i === 1 ? 'Spa' : `Body ${i + 1}`),
      currentTemp: body.currentTemp,
      setPoint: body.setPoint,
      heatMode: body.heatMode,
      heatStatus: body.heatStatus || false
    }));

    const circuits: Circuit[] = (state.circuitArray || []).map((circuit: any) => ({
      id: circuit.id,
      name: circuit.name || circuit.circuitName || `Circuit ${circuit.id}`,
      state: circuit.state || false,
      circuitFunction: circuit.circuitFunction || 0
    }));

    // Get pump IDs from equipment config
    let pumpIds: number[] = [];
    try {
      const equipConfig = await client.equipment.getEquipmentConfigurationAsync();
      if (equipConfig.pumps && Array.isArray(equipConfig.pumps)) {
        pumpIds = equipConfig.pumps
          .filter((p: any) => p && p.pentairType > 0)
          .map((p: any) => p.id);
      }
    } catch {
      // Equipment config fetch failed, continue without pump IDs
    }

    return {
      connected: true,
      lastUpdated: new Date().toISOString(),
      airTemp: state.airTemp || 0,
      bodies,
      circuits,
      freezeMode: state.freezeMode || false,
      connectionType,
      pumpIds: pumpIds.length > 0 ? pumpIds : undefined,
      // Delay states - non-zero means delay is active
      poolDelay: (state.poolDelay || 0) > 0,
      spaDelay: (state.spaDelay || 0) > 0,
      cleanerDelay: (state.cleanerDelay || 0) > 0,
    };
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Toggle a circuit on/off
 */
export async function setCircuitState(circuitId: number, state: boolean, requestCredentials?: Credentials): Promise<void> {
  log('setCircuitState: Starting', { circuitId, state });
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`setCircuitState: Setting circuit state (connection #${connectionId})`);
    await client.circuits.setCircuitStateAsync(circuitId, state ? 1 : 0);
    log(`setCircuitState: Circuit state set successfully`);
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Cancel any active delays (pool off delay, spa off delay, cleaner delay)
 */
export async function cancelDelay(requestCredentials?: Credentials): Promise<void> {
  log('cancelDelay: Starting');
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`cancelDelay: Cancelling delays (connection #${connectionId})`);
    await client.equipment.cancelDelayAsync();
    log(`cancelDelay: Delays cancelled successfully`);
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Set circuit runtime (egg timer) - circuit will auto-off after specified minutes
 */
export async function setCircuitRuntime(circuitId: number, minutes: number, requestCredentials?: Credentials): Promise<void> {
  log('setCircuitRuntime: Starting', { circuitId, minutes });
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`setCircuitRuntime: Setting circuit runtime (connection #${connectionId})`);
    await client.circuits.setCircuitRuntimebyIdAsync(circuitId, minutes);
    log(`setCircuitRuntime: Circuit runtime set successfully`);
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Set body temperature setpoint
 */
export async function setBodyTemperature(bodyIndex: number, temp: number, requestCredentials?: Credentials): Promise<void> {
  log('setBodyTemperature: Starting', { bodyIndex, temp });
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`setBodyTemperature: Setting temperature (connection #${connectionId})`);
    await client.bodies.setSetPointAsync(bodyIndex, temp);
    log(`setBodyTemperature: Temperature set successfully`);
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Set heat mode for a body
 */
export async function setHeatMode(bodyIndex: number, mode: number, requestCredentials?: Credentials): Promise<void> {
  log('setHeatMode: Starting', { bodyIndex, mode });
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`setHeatMode: Setting heat mode (connection #${connectionId})`);
    await client.bodies.setHeatModeAsync(bodyIndex, mode);
    log(`setHeatMode: Heat mode set successfully`);
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Send light command
 */
export async function sendLightCommand(command: number, requestCredentials?: Credentials): Promise<void> {
  log('sendLightCommand: Starting', { command });
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`sendLightCommand: Sending command (connection #${connectionId})`);
    await client.lights.sendLightCommandAsync(0, command);
    log(`sendLightCommand: Command sent successfully`);
  } finally {
    await closeClient(client, connectionId, release);
  }
}

export interface HistoryData {
  airTemps: { time: string; temp: number }[];
  poolTemps: { time: string; temp: number }[];
  spaTemps: { time: string; temp: number }[];
  poolSetPointTemps: { time: string; temp: number }[];
  spaSetPointTemps: { time: string; temp: number }[];
  poolRuns: { on: string; off: string }[];
  spaRuns: { on: string; off: string }[];
  solarRuns: { on: string; off: string }[];
  heaterRuns: { on: string; off: string }[];
  lightRuns: { on: string; off: string }[];
}

// Schedule types
export interface ScheduleEvent {
  scheduleId: number;
  circuitId: number;
  startTime: number; // Minutes from midnight
  stopTime: number;  // Minutes from midnight
  dayMask: number;   // Bitmask for days (1=Sun, 2=Mon, 4=Tue, etc.)
  flags: number;
  heatCmd: number;
  heatSetPoint: number;
  scheduleType: 'recurring' | 'runonce';
}

export interface ScheduleData {
  recurring: ScheduleEvent[];
  runOnce: ScheduleEvent[];
}

export interface EggTimer {
  circuitId: number;
  circuitName: string;
  runtime: number; // Minutes (0 = no limit)
}

// Controller and equipment configuration
export interface CircuitDefinition {
  circuitId: number;
  name: string;
  function: number;
  interface: number;
  freeze: boolean;
  colorSet: number;
  colorPos: number;
  colorStagger: number;
  eggTimer: number; // Runtime in minutes
}

export interface PumpCircuit {
  circuitId: number;
  speed: number;
  isRPM: boolean;
}

export interface PumpConfig {
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

export interface ControllerConfig {
  controllerType: number;
  hardwareType: number;
  controllerData: number;
  versionDataArray: number[];
  speedDataArray: number[];
  valveDataArray: number[];
  remoteDataArray: number[];
  sensorDataArray: number[];
  delayDataArray: number[];
  macroDataArray: number[];
  miscDataArray: number[];
  lightDataArray: number[];
  pumpDataArray: number[];
  sgDataArray: number[];
  spaFlowDataArray: number[];
  degC: boolean;
  equipment: Record<string, boolean>;
  circuitCount: number;
  colorCount: number;
  minSetPoint: number[];
  maxSetPoint: number[];
  circuitArray: CircuitDefinition[];
  colorArray: { name: string; color: { r: number; g: number; b: number } }[];
  bodyArray: { bodyType: number; name: string }[];
}

export interface EquipmentConfig {
  controllerType: number;
  hardwareType: number;
  expansionCount: number;
  version: number;
  heaterConfig: {
    body1SolarPresent: boolean;
    body1HeatPumpPresent: boolean;
    body2SolarPresent: boolean;
    thermaFloPresent: boolean;
    thermaFloCoolPresent: boolean;
    body1: number;
    body2: number;
    solarHeatPump: number;
  };
  valveCount: number;
  valves: { valveIndex: number; valveName: string; loadCenterIndex: number; deviceId: number }[];
  highSpeedCircuits: number[];
  pumps: PumpConfig[];
}

export interface FullConfig {
  controller: ControllerConfig;
  equipment: EquipmentConfig;
}

/**
 * Get system time from the controller
 * Returns the controller's current time and DST setting
 */
export async function getSystemTime(requestCredentials?: Credentials): Promise<{ date: Date; adjustForDST: boolean }> {
  log('getSystemTime: Starting');
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`getSystemTime: Fetching system time (connection #${connectionId})`);
    const systemTime = await client.equipment.getSystemTimeAsync();
    log(`getSystemTime: System time fetched`, { 
      date: systemTime.date,
      adjustForDST: systemTime.adjustForDST 
    });
    return {
      date: systemTime.date,
      adjustForDST: systemTime.adjustForDST
    };
  } catch (err) {
    log(`getSystemTime: Error fetching system time`, { error: (err as Error).message });
    throw err;
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Get history data
 * Uses extended timeout since large date ranges can take 30+ seconds
 */
export async function getHistoryData(fromTime?: Date, toTime?: Date, requestCredentials?: Credentials): Promise<HistoryData> {
  log('getHistoryData: Starting', { fromTime: fromTime?.toISOString(), toTime: toTime?.toISOString() });
  const credentials = getCredentials(requestCredentials);
  // Use extended timeout for history requests
  const { client, connectionId, release } = await createClient(credentials, false, true);

  let history: HistoryData;
  try {
    log(`getHistoryData: Fetching history (connection #${connectionId})`);
    history = await client.equipment.getHistoryDataAsync(fromTime, toTime);
    log(`getHistoryData: History fetched successfully`);
  } catch (err) {
    log(`getHistoryData: Error fetching history`, { error: (err as Error).message });
    throw err;
  } finally {
    await closeClient(client, connectionId, release);
  }
  return history;
}

// ============================================================================
// SCHEDULES
// ============================================================================

/**
 * Get all schedules (recurring and run-once)
 */
export async function getSchedules(requestCredentials?: Credentials): Promise<ScheduleData> {
  log('getSchedules: Starting');
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`getSchedules: Fetching schedules (connection #${connectionId})`);
    
    // Type 0 = recurring, Type 1 = run-once
    const recurringData = await client.schedule.getScheduleDataAsync(0);
    const runOnceData = await client.schedule.getScheduleDataAsync(1);
    
    // Helper to parse time string "HHMM" or "HMM" to minutes from midnight
    const parseTimeStr = (timeStr: string | number): number => {
      if (typeof timeStr === 'number') return timeStr;
      const str = timeStr.padStart(4, '0');
      const hours = parseInt(str.slice(0, 2), 10);
      const mins = parseInt(str.slice(2, 4), 10);
      return hours * 60 + mins;
    };
    
    // API returns 'data' array, not 'events'
    const recurring: ScheduleEvent[] = (recurringData.data || recurringData.events || []).map((e: any) => ({
      scheduleId: e.scheduleId,
      circuitId: e.circuitId,
      startTime: parseTimeStr(e.startTime),
      stopTime: parseTimeStr(e.stopTime),
      dayMask: e.dayMask,
      flags: e.flags,
      heatCmd: e.heatCmd,
      heatSetPoint: e.heatSetPoint,
      scheduleType: 'recurring' as const,
    }));
    
    const runOnce: ScheduleEvent[] = (runOnceData.data || runOnceData.events || []).map((e: any) => ({
      scheduleId: e.scheduleId,
      circuitId: e.circuitId,
      startTime: parseTimeStr(e.startTime),
      stopTime: parseTimeStr(e.stopTime),
      dayMask: e.dayMask,
      flags: e.flags,
      heatCmd: e.heatCmd,
      heatSetPoint: e.heatSetPoint,
      scheduleType: 'runonce' as const,
    }));
    
    log(`getSchedules: Found ${recurring.length} recurring, ${runOnce.length} run-once`);
    return { recurring, runOnce };
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Create a new schedule
 */
export async function createSchedule(
  scheduleType: 'recurring' | 'runonce',
  circuitId: number,
  startTime: number,
  stopTime: number,
  dayMask: number,
  flags: number = 0,
  heatCmd: number = 4, // 4 = don't change
  heatSetPoint: number = 0,
  requestCredentials?: Credentials
): Promise<number> {
  log('createSchedule: Starting', { scheduleType, circuitId, startTime, stopTime, dayMask });
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`createSchedule: Creating schedule (connection #${connectionId})`);
    const type = scheduleType === 'recurring' ? 0 : 1;
    const result = await client.schedule.addNewScheduleEventAsync(type, circuitId, startTime, stopTime, dayMask, flags, heatCmd, heatSetPoint);
    log(`createSchedule: Schedule created with ID ${result.scheduleId}`);
    return result.scheduleId;
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Update an existing schedule
 */
export async function updateSchedule(
  scheduleId: number,
  circuitId: number,
  startTime: number,
  stopTime: number,
  dayMask: number,
  flags: number = 0,
  heatCmd: number = 4,
  heatSetPoint: number = 0,
  requestCredentials?: Credentials
): Promise<void> {
  log('updateSchedule: Starting', { scheduleId, circuitId, startTime, stopTime, dayMask });
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`updateSchedule: Updating schedule (connection #${connectionId})`);
    await client.schedule.setScheduleEventByIdAsync(scheduleId, circuitId, startTime, stopTime, dayMask, flags, heatCmd, heatSetPoint);
    log(`updateSchedule: Schedule updated successfully`);
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Delete a schedule
 */
export async function deleteSchedule(scheduleId: number, requestCredentials?: Credentials): Promise<void> {
  log('deleteSchedule: Starting', { scheduleId });
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`deleteSchedule: Deleting schedule (connection #${connectionId})`);
    await client.schedule.deleteScheduleEventByIdAsync(scheduleId);
    log(`deleteSchedule: Schedule deleted successfully`);
  } finally {
    await closeClient(client, connectionId, release);
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Get just the controller config (circuits, etc.) - lightweight version
 */
export async function getControllerConfig(requestCredentials?: Credentials): Promise<ControllerConfig> {
  log('getControllerConfig: Starting');
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`getControllerConfig: Fetching controller config (connection #${connectionId})`);
    const controllerConfig = await client.equipment.getControllerConfigAsync();
    
    return {
      controllerType: controllerConfig.controllerType,
      hardwareType: controllerConfig.hardwareType,
      controllerData: controllerConfig.controllerData,
      versionDataArray: controllerConfig.versionDataArray || [],
      speedDataArray: controllerConfig.speedDataArray || [],
      valveDataArray: controllerConfig.valveDataArray || [],
      remoteDataArray: controllerConfig.remoteDataArray || [],
      sensorDataArray: controllerConfig.sensorDataArray || [],
      delayDataArray: controllerConfig.delayDataArray || [],
      macroDataArray: controllerConfig.macroDataArray || [],
      miscDataArray: controllerConfig.miscDataArray || [],
      lightDataArray: controllerConfig.lightDataArray || [],
      pumpDataArray: controllerConfig.pumpDataArray || [],
      sgDataArray: controllerConfig.sgDataArray || [],
      spaFlowDataArray: controllerConfig.spaFlowDataArray || [],
      degC: controllerConfig.degC || false,
      equipment: controllerConfig.equipment || {},
      circuitCount: controllerConfig.circuitCount || 0,
      colorCount: controllerConfig.colorCount || 0,
      minSetPoint: controllerConfig.minSetPoint || [],
      maxSetPoint: controllerConfig.maxSetPoint || [],
      circuitArray: (controllerConfig.circuitArray || []).map((c: any) => ({
        circuitId: c.circuitId,
        name: c.name || `Circuit ${c.circuitId}`,
        nameIndex: c.nameIndex || 0,
        function: c.function,
        interface: c.interface,
        freeze: c.freeze || false,
        colorSet: c.colorSet || 0,
        colorPos: c.colorPos || 0,
        colorStagger: c.colorStagger || 0,
        eggTimer: c.eggTimer || 720,
      })),
      colorArray: (controllerConfig.colorArray || []).map((c: any) => ({
        name: c.name,
        color: { r: c.color?.r || 0, g: c.color?.g || 0, b: c.color?.b || 0 },
      })),
      bodyArray: (controllerConfig.bodyArray || []).map((b: any) => ({
        bodyType: b.bodyType,
        name: b.name,
      })),
    };
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Get full controller and equipment configuration
 */
export async function getFullConfig(requestCredentials?: Credentials): Promise<FullConfig> {
  log('getFullConfig: Starting');
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`getFullConfig: Fetching controller config (connection #${connectionId})`);
    const controllerConfig = await client.equipment.getControllerConfigAsync();
    
    log(`getFullConfig: Fetching equipment config`);
    const equipmentConfig = await client.equipment.getEquipmentConfigurationAsync();
    
    // Extract pump data from equipment config (more reliable than getPumpStatusAsync)
    const pumps: PumpConfig[] = [];
    if (equipmentConfig.pumps && Array.isArray(equipmentConfig.pumps)) {
      for (const equipPump of equipmentConfig.pumps) {
        if (equipPump && equipPump.pentairType > 0) {
          pumps.push({
            pumpId: equipPump.id,
            pumpType: equipPump.pentairType,
            pumpName: equipPump.name,
            isRunning: false, // Would need live status call
            watts: 0,
            rpm: 0,
            gpm: 0,
            pumpCircuits: (equipPump.circuits || [])
              .filter((c: any) => c.circuit > 0)
              .map((c: any) => ({
                circuitId: c.circuit,
                speed: c.speed,
                isRPM: c.units === 0,
              })),
            primingSpeed: equipPump.primingSpeed || 0,
            primingTime: equipPump.primingTime || 0,
            minSpeed: equipPump.minSpeed,
            maxSpeed: equipPump.maxSpeed,
          });
        }
      }
    }
    
    const controller: ControllerConfig = {
      controllerType: controllerConfig.controllerType,
      hardwareType: controllerConfig.hardwareType,
      controllerData: controllerConfig.controllerData,
      versionDataArray: controllerConfig.versionDataArray || [],
      speedDataArray: controllerConfig.speedDataArray || [],
      valveDataArray: controllerConfig.valveDataArray || [],
      remoteDataArray: controllerConfig.remoteDataArray || [],
      sensorDataArray: controllerConfig.sensorDataArray || [],
      delayDataArray: controllerConfig.delayDataArray || [],
      macroDataArray: controllerConfig.macroDataArray || [],
      miscDataArray: controllerConfig.miscDataArray || [],
      lightDataArray: controllerConfig.lightDataArray || [],
      pumpDataArray: controllerConfig.pumpDataArray || [],
      sgDataArray: controllerConfig.sgDataArray || [],
      spaFlowDataArray: controllerConfig.spaFlowDataArray || [],
      degC: controllerConfig.degC || false,
      equipment: controllerConfig.equipment || {},
      circuitCount: controllerConfig.circuitCount || 0,
      colorCount: controllerConfig.colorCount || 0,
      minSetPoint: controllerConfig.minSetPoint || [],
      maxSetPoint: controllerConfig.maxSetPoint || [],
      circuitArray: (controllerConfig.circuitArray || []).map((c: any) => ({
        circuitId: c.circuitId,
        name: c.name || `Circuit ${c.circuitId}`,
        nameIndex: c.nameIndex || 0,
        function: c.function,
        interface: c.interface,
        freeze: c.freeze || false,
        colorSet: c.colorSet || 0,
        colorPos: c.colorPos || 0,
        colorStagger: c.colorStagger || 0,
        eggTimer: c.eggTimer || 720,
      })),
      colorArray: (controllerConfig.colorArray || []).map((c: any) => ({
        name: c.name,
        color: { r: c.color?.r || 0, g: c.color?.g || 0, b: c.color?.b || 0 },
      })),
      bodyArray: (controllerConfig.bodyArray || []).map((b: any) => ({
        bodyType: b.bodyType,
        name: b.name,
      })),
    };
    
    const equipment: EquipmentConfig = {
      controllerType: equipmentConfig.controllerType || 0,
      hardwareType: equipmentConfig.hardwareType || 0,
      expansionCount: equipmentConfig.expansionCount || 0,
      version: equipmentConfig.version || 0,
      heaterConfig: {
        body1SolarPresent: equipmentConfig.heaterConfig?.body1SolarPresent || false,
        body1HeatPumpPresent: equipmentConfig.heaterConfig?.body1HeatPumpPresent || false,
        body2SolarPresent: equipmentConfig.heaterConfig?.body2SolarPresent || false,
        thermaFloPresent: equipmentConfig.heaterConfig?.thermaFloPresent || false,
        thermaFloCoolPresent: equipmentConfig.heaterConfig?.thermaFloCoolPresent || false,
        body1: equipmentConfig.heaterConfig?.body1 || 0,
        body2: equipmentConfig.heaterConfig?.body2 || 0,
        solarHeatPump: equipmentConfig.heaterConfig?.solarHeatPump || 0,
      },
      valveCount: equipmentConfig.valveCount || 0,
      valves: (equipmentConfig.valves || []).map((v: any) => ({
        valveIndex: v.valveIndex,
        valveName: v.valveName,
        loadCenterIndex: v.loadCenterIndex,
        deviceId: v.deviceId,
      })),
      highSpeedCircuits: equipmentConfig.highSpeedCircuits || [],
      pumps,
    };
    
    log(`getFullConfig: Config fetched successfully`);
    return { controller, equipment };
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Get pump status
 */
export async function getPumpStatus(pumpId: number, requestCredentials?: Credentials): Promise<PumpConfig | null> {
  log('getPumpStatus: Starting', { pumpId });
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`getPumpStatus: Fetching pump status (connection #${connectionId})`);
    const pump = await client.pump.getPumpStatusAsync(pumpId);
    
    if (!pump || pump.pumpType === 0) {
      return null;
    }
    
    return {
      pumpId,
      pumpType: pump.pumpType,
      isRunning: pump.isRunning,
      watts: pump.pumpWatts ?? pump.watts ?? 0,
      rpm: pump.pumpRPMs ?? pump.rpm ?? 0,
      gpm: pump.pumpGPMs ?? pump.gpm ?? 0,
      pumpCircuits: (pump.pumpCircuits || []).filter((pc: any) => pc.circuitId > 0).map((pc: any) => ({
        circuitId: pc.circuitId,
        speed: pc.speed,
        isRPM: pc.isRPMs ?? pc.isRPM ?? true,
      })),
      primingSpeed: pump.primingSpeed || 0,
      primingTime: pump.primingTime || 0,
    };
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Set pump circuit speed
 */
export async function setPumpCircuitSpeed(
  pumpId: number,
  circuitId: number,
  speed: number,
  isRPM: boolean = true,
  requestCredentials?: Credentials
): Promise<void> {
  log('setPumpCircuitSpeed: Starting', { pumpId, circuitId, speed, isRPM });
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`setPumpCircuitSpeed: Setting pump speed (connection #${connectionId})`);
    await client.pump.setPumpSpeedAsync(pumpId, circuitId, speed, isRPM);
    log(`setPumpCircuitSpeed: Pump speed set successfully`);
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Set system time
 */
export async function setSystemTime(date: Date, adjustForDST: boolean, requestCredentials?: Credentials): Promise<void> {
  log('setSystemTime: Starting', { date: date.toISOString(), adjustForDST });
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`setSystemTime: Setting system time (connection #${connectionId})`);
    await client.equipment.setSystemTimeAsync(date, adjustForDST);
    log(`setSystemTime: System time set successfully`);
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Get circuit definitions (built-in names)
 */
export async function getCircuitDefinitions(requestCredentials?: Credentials): Promise<{ id: number; name: string }[]> {
  log('getCircuitDefinitions: Starting');
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`getCircuitDefinitions: Fetching circuit definitions (connection #${connectionId})`);
    const result = await client.equipment.getCircuitDefinitionsAsync();
    log(`getCircuitDefinitions: Found ${result.circuits?.length || 0} definitions`);
    return (result.circuits || []).map((c: any) => ({
      id: c.id,
      name: c.circuitName || `Circuit ${c.id}`,
    }));
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Get custom names (user-defined circuit names)
 */
export async function getCustomNames(requestCredentials?: Credentials): Promise<string[]> {
  log('getCustomNames: Starting');
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`getCustomNames: Fetching custom names (connection #${connectionId})`);
    const result = await client.equipment.getCustomNamesAsync();
    log(`getCustomNames: Found ${result.names?.length || 0} custom names`);
    return result.names || [];
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Set a custom name (max 11 characters)
 */
export async function setCustomName(index: number, name: string, requestCredentials?: Credentials): Promise<void> {
  log('setCustomName: Starting', { index, name });
  if (name.length > 11) {
    throw new Error('Custom name must be 11 characters or less');
  }
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`setCustomName: Setting custom name (connection #${connectionId})`);
    await client.equipment.setCustomNameAsync(index, name);
    log(`setCustomName: Custom name set successfully`);
  } finally {
    await closeClient(client, connectionId, release);
  }
}

/**
 * Set circuit configuration
 */
export async function setCircuitConfig(
  circuitId: number,
  nameIndex: number,
  circuitFunction: number,
  circuitInterface: number,
  freeze: boolean,
  colorPos: number,
  requestCredentials?: Credentials
): Promise<void> {
  log('setCircuitConfig: Starting', { circuitId, nameIndex, circuitFunction, circuitInterface, freeze, colorPos });
  const credentials = getCredentials(requestCredentials);
  const { client, connectionId, release } = await createClient(credentials);

  try {
    log(`setCircuitConfig: Setting circuit config (connection #${connectionId})`);
    await client.circuits.setCircuitAsync(circuitId, nameIndex, circuitFunction, circuitInterface, freeze, colorPos);
    log(`setCircuitConfig: Circuit config set successfully`);
  } finally {
    await closeClient(client, connectionId, release);
  }
}
