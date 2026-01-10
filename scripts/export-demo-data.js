#!/usr/bin/env node
/**
 * Export real pool data for demo mode
 * Run this locally while connected to your pool to capture current state
 * 
 * Usage: node scripts/export-demo-data.js
 */

const ScreenLogic = require('node-screenlogic');
const fs = require('fs');
const path = require('path');

// Load local credentials
let config;
try {
  config = require('../config.local.js');
} catch {
  console.error('Error: config.local.js not found. Create it with your pool credentials.');
  console.error('Example:');
  console.error('  module.exports = { systemName: "Pentair: XX-XX-XX", password: "yourpassword" };');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, '../public/demo-data');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function writeJson(filename, data) {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`✓ Wrote ${filepath}`);
}

async function discoverLocalUnit(timeoutMs = 5000) {
  return new Promise((resolve) => {
    try {
      const finder = new ScreenLogic.FindUnits();
      const units = [];
      
      finder.on('serverFound', (server) => {
        units.push(server);
      });
      
      finder.search();
      
      setTimeout(() => {
        finder.close();
        resolve(units[0] || null);
      }, timeoutMs);
    } catch {
      resolve(null);
    }
  });
}

// Helper to wrap async calls with a custom timeout
function withTimeout(promise, timeoutMs, errorMsg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMsg || 'Operation timed out')), timeoutMs)
    )
  ]);
}

// Cache the discovered local unit address
let cachedLocalUnit = null;

async function connectToPool(quiet = false) {
  if (!quiet) console.log('Discovering local pool controller...');
  
  // Use cached address if available
  if (!cachedLocalUnit) {
    cachedLocalUnit = await discoverLocalUnit();
  }
  
  const client = new ScreenLogic.UnitConnection();
  
  if (cachedLocalUnit) {
    if (!quiet) console.log(`Found local unit at ${cachedLocalUnit.address}:${cachedLocalUnit.port}`);
    client.init(config.systemName, cachedLocalUnit.address, cachedLocalUnit.port, config.password);
  } else {
    if (!quiet) console.log('No local unit found, trying remote connection...');
    const gateway = new ScreenLogic.RemoteLogin(config.systemName);
    const unit = await gateway.connectAsync();
    
    if (!unit || !unit.gatewayFound) {
      throw new Error('Could not find gateway');
    }
    
    await gateway.closeAsync();
    client.init(config.systemName, unit.ipAddr, unit.port, config.password);
  }
  
  await client.connectAsync();
  if (!quiet) console.log('Connected to pool controller\n');
  return client;
}

async function exportStatus(client) {
  console.log('Exporting status...');
  const state = await client.equipment.getEquipmentStateAsync();
  
  const bodies = (state.bodies || []).map((body, i) => ({
    bodyType: body.bodyType,
    name: body.name || (i === 0 ? 'Pool' : i === 1 ? 'Spa' : `Body ${i + 1}`),
    currentTemp: body.currentTemp,
    setPoint: body.setPoint,
    heatMode: body.heatMode,
    heatStatus: body.heatStatus || false
  }));

  const circuits = (state.circuitArray || []).map((circuit) => ({
    id: circuit.id,
    name: circuit.name || circuit.circuitName || `Circuit ${circuit.id}`,
    state: circuit.state || false,
    circuitFunction: circuit.circuitFunction || 0
  }));

  // Get pump IDs from equipment config
  let pumpIds = [];
  try {
    const equipConfig = await client.equipment.getEquipmentConfigurationAsync();
    if (equipConfig.pumps && Array.isArray(equipConfig.pumps)) {
      pumpIds = equipConfig.pumps
        .filter((p) => p && p.pentairType > 0)
        .map((p) => p.id);
    }
  } catch {
    // Continue without pump IDs
  }

  const status = {
    connected: true,
    lastUpdated: new Date().toISOString(),
    airTemp: state.airTemp || 0,
    bodies,
    circuits,
    freezeMode: state.freezeMode || false,
    connectionType: 'demo',
    pumpIds: pumpIds.length > 0 ? pumpIds : undefined,
    poolDelay: false,
    spaDelay: false,
    cleanerDelay: false,
  };
  
  writeJson('status.json', status);
  return status;
}

async function exportConfig(client) {
  console.log('Exporting configuration...');
  
  // Get controller config
  const controllerConfig = await client.equipment.getControllerConfigAsync();
  
  // Get equipment config
  const equipmentConfig = await client.equipment.getEquipmentConfigurationAsync();
  
  // Get pump status for each pump
  const pumpsWithStatus = [];
  if (equipmentConfig.pumps) {
    for (const pump of equipmentConfig.pumps) {
      if (pump && pump.pentairType > 0) {
        try {
          const pumpStatus = await client.pump.getPumpStatusAsync(pump.id);
          pumpsWithStatus.push({
            ...pump,
            isRunning: pumpStatus.isRunning || false,
            watts: pumpStatus.watts || 0,
            rpm: pumpStatus.rpm || 0,
            gpm: pumpStatus.gpm || 0,
          });
        } catch {
          pumpsWithStatus.push({
            ...pump,
            isRunning: false,
            watts: 0,
            rpm: 0,
            gpm: 0,
          });
        }
      }
    }
  }
  
  const fullConfig = {
    controller: {
      controllerType: controllerConfig.controllerType,
      hardwareType: controllerConfig.hardwareType,
      controllerData: controllerConfig.controllerData,
      degC: controllerConfig.degC || false,
      equipment: controllerConfig.equipment || {},
      circuitCount: controllerConfig.circuitCount || 0,
      colorCount: controllerConfig.colorCount || 0,
      minSetPoint: controllerConfig.minSetPoint || [],
      maxSetPoint: controllerConfig.maxSetPoint || [],
      circuitArray: (controllerConfig.circuitArray || []).map((c) => ({
        circuitId: c.circuitId,
        name: c.name,
        function: c.function,
        interface: c.interface,
        freeze: c.freeze || false,
        colorSet: c.colorSet || 0,
        colorPos: c.colorPos || 0,
        colorStagger: c.colorStagger || 0,
        eggTimer: c.eggTimer || 0,
      })),
      colorArray: controllerConfig.colorArray || [],
      bodyArray: controllerConfig.bodyArray || [],
    },
    equipment: {
      controllerType: equipmentConfig.controllerType,
      hardwareType: equipmentConfig.hardwareType,
      expansionCount: equipmentConfig.expansionCount || 0,
      version: equipmentConfig.version || 0,
      heaterConfig: equipmentConfig.heaterConfig || {},
      valveCount: equipmentConfig.valveCount || 0,
      valves: equipmentConfig.valves || [],
      highSpeedCircuits: equipmentConfig.highSpeedCircuits || [],
      pumps: pumpsWithStatus,
    },
  };
  
  writeJson('config.json', fullConfig);
  return fullConfig;
}

async function exportSchedules(client) {
  console.log('Exporting schedules...');
  
  const parseTimeStr = (timeStr) => {
    if (typeof timeStr === 'number') return timeStr;
    const str = String(timeStr).padStart(4, '0');
    const hours = parseInt(str.slice(0, 2), 10);
    const mins = parseInt(str.slice(2, 4), 10);
    return hours * 60 + mins;
  };
  
  const recurringData = await client.schedule.getScheduleDataAsync(0);
  const runOnceData = await client.schedule.getScheduleDataAsync(1);
  
  const recurring = (recurringData.data || recurringData.events || []).map((e) => ({
    scheduleId: e.scheduleId,
    circuitId: e.circuitId,
    startTime: parseTimeStr(e.startTime),
    stopTime: parseTimeStr(e.stopTime),
    dayMask: e.dayMask,
    flags: e.flags,
    heatCmd: e.heatCmd,
    heatSetPoint: e.heatSetPoint,
    scheduleType: 'recurring',
  }));
  
  const runOnce = (runOnceData.data || runOnceData.events || []).map((e) => ({
    scheduleId: e.scheduleId,
    circuitId: e.circuitId,
    startTime: parseTimeStr(e.startTime),
    stopTime: parseTimeStr(e.stopTime),
    dayMask: e.dayMask,
    flags: e.flags,
    heatCmd: e.heatCmd,
    heatSetPoint: e.heatSetPoint,
    scheduleType: 'runonce',
  }));
  
  const schedules = { recurring, runOnce };
  writeJson('schedules.json', schedules);
  return schedules;
}

async function exportHistory() {
  console.log('Fetching missing history chunk (2025-05-28 to 2025-06-04)...');
  
  // Load existing history data
  const existingPath = path.join(OUTPUT_DIR, 'history.json');
  let existingHistory;
  try {
    existingHistory = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
    console.log(`  Loaded existing history: ${existingHistory.airTemps.length} air temps`);
  } catch {
    console.log('  No existing history found, starting fresh');
    existingHistory = {
      airTemps: [],
      poolTemps: [],
      spaTemps: [],
      poolSetPointTemps: [],
      spaSetPointTemps: [],
      poolRuns: [],
      spaRuns: [],
      solarRuns: [],
      heaterRuns: [],
      lightRuns: [],
    };
  }
  
  // Fetch Dec 17, 2025 to now (in 3-day chunks)
  const missingChunks = [
    { start: new Date('2025-12-17T00:00:00.000Z'), end: new Date('2025-12-20T00:00:00.000Z') },
    { start: new Date('2025-12-20T00:00:00.000Z'), end: new Date('2025-12-23T00:00:00.000Z') },
    { start: new Date('2025-12-23T00:00:00.000Z'), end: new Date('2025-12-26T00:00:00.000Z') },
    { start: new Date('2025-12-26T00:00:00.000Z'), end: new Date('2025-12-29T00:00:00.000Z') },
    { start: new Date('2025-12-29T00:00:00.000Z'), end: new Date('2026-01-01T00:00:00.000Z') },
    { start: new Date('2026-01-01T00:00:00.000Z'), end: new Date('2026-01-04T00:00:00.000Z') },
    { start: new Date('2026-01-04T00:00:00.000Z'), end: new Date('2026-01-07T00:00:00.000Z') },
    { start: new Date('2026-01-07T00:00:00.000Z'), end: new Date('2026-01-11T00:00:00.000Z') },
  ];
  
  for (const chunk of missingChunks) {
    console.log(`  Fetching: ${chunk.start.toISOString().slice(0, 10)} to ${chunk.end.toISOString().slice(0, 10)}`);
    
    let client;
    try {
      client = await connectToPool(true);
      
      // Use 30 second timeout for history fetch
      const history = await withTimeout(
        client.equipment.getHistoryDataAsync(chunk.start, chunk.end),
        30000,
        'History fetch timed out after 30s'
      );
      
      // Merge into existing data
      existingHistory.airTemps.push(...(history.airTemps || []));
      existingHistory.poolTemps.push(...(history.poolTemps || []));
      existingHistory.spaTemps.push(...(history.spaTemps || []));
      existingHistory.poolSetPointTemps.push(...(history.poolSetPointTemps || []));
      existingHistory.spaSetPointTemps.push(...(history.spaSetPointTemps || []));
      existingHistory.poolRuns.push(...(history.poolRuns || []));
      existingHistory.spaRuns.push(...(history.spaRuns || []));
      existingHistory.solarRuns.push(...(history.solarRuns || []));
      existingHistory.heaterRuns.push(...(history.heaterRuns || []));
      existingHistory.lightRuns.push(...(history.lightRuns || []));
      
      console.log(`    Got ${(history.airTemps || []).length} air temps, ${(history.poolRuns || []).length} pool runs`);
    } catch (err) {
      console.log(`    Failed: ${err.message}`);
    } finally {
      if (client) {
        try { await client.closeAsync(); } catch {}
      }
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Sort all arrays by time to maintain chronological order
  existingHistory.airTemps.sort((a, b) => new Date(a.time) - new Date(b.time));
  existingHistory.poolTemps.sort((a, b) => new Date(a.time) - new Date(b.time));
  existingHistory.spaTemps.sort((a, b) => new Date(a.time) - new Date(b.time));
  existingHistory.poolSetPointTemps.sort((a, b) => new Date(a.time) - new Date(b.time));
  existingHistory.spaSetPointTemps.sort((a, b) => new Date(a.time) - new Date(b.time));
  existingHistory.poolRuns.sort((a, b) => new Date(a.on) - new Date(b.on));
  existingHistory.spaRuns.sort((a, b) => new Date(a.on) - new Date(b.on));
  existingHistory.solarRuns.sort((a, b) => new Date(a.on) - new Date(b.on));
  existingHistory.heaterRuns.sort((a, b) => new Date(a.on) - new Date(b.on));
  existingHistory.lightRuns.sort((a, b) => new Date(a.on) - new Date(b.on));
  
  // Update metadata
  existingHistory.exportedAt = new Date().toISOString();
  
  console.log(`\n  Total: ${existingHistory.airTemps.length} air temp readings`);
  console.log(`  Total: ${existingHistory.poolTemps.length} pool temp readings`);
  console.log(`  Total: ${existingHistory.poolRuns.length} pool run periods`);
  
  writeJson('history.json', existingHistory);
  return existingHistory;
}

async function exportSystemTime(client) {
  console.log('Exporting system time...');
  
  const systemTime = await client.equipment.getSystemTimeAsync();
  
  const timeData = {
    date: systemTime.date,
    adjustForDST: systemTime.adjustForDST,
    exportedAt: new Date().toISOString(),
  };
  
  writeJson('system.json', timeData);
  return timeData;
}

async function main() {
  console.log('=== Pool Data Export for Demo Mode ===\n');
  
  let client;
  try {
    client = await connectToPool();
    
    await exportStatus(client);
    await exportConfig(client);
    await exportSchedules(client);
    await exportSystemTime(client);
    
    // Close initial connection before history export (it manages its own connections)
    try { await client.closeAsync(); } catch {}
    client = null;
    
    // History export creates fresh connections for each chunk
    await exportHistory();
    
    console.log('\n✓ All data exported successfully!');
    console.log(`  Output directory: ${OUTPUT_DIR}`);
    
  } catch (err) {
    console.error('\n✗ Export failed:', err.message);
    process.exit(1);
  } finally {
    if (client) {
      try {
        await client.closeAsync();
      } catch {
        // Ignore close errors
      }
    }
  }
}

main();
