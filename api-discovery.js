#!/usr/bin/env node
/**
 * Full API Discovery - Document all available features
 */

const ScreenLogic = require('node-screenlogic');
const config = require('./config.local.js');

async function connect() {
  const gateway = new ScreenLogic.RemoteLogin(config.systemName);
  const unit = await gateway.connectAsync();
  await gateway.closeAsync();
  
  const client = new ScreenLogic.UnitConnection();
  client.init(config.systemName, unit.ipAddr, unit.port, config.password);
  await client.connectAsync();
  
  return client;
}

async function main() {
  console.log('🔍 PLUNGE - Full API Discovery\n');
  console.log('='.repeat(60));
  
  const client = await connect();
  console.log('✅ Connected\n');

  const results = {};

  // 1. VERSION
  console.log('\n' + '='.repeat(60));
  console.log('📟 VERSION');
  console.log('='.repeat(60));
  try {
    const version = await client.getVersionAsync();
    results.version = version;
    console.log(JSON.stringify(version, null, 2));
  } catch (e) { console.log('Error:', e.message); }

  // 2. CONTROLLER CONFIG
  console.log('\n' + '='.repeat(60));
  console.log('⚙️  CONTROLLER CONFIG');
  console.log('='.repeat(60));
  try {
    const config = await client.equipment.getControllerConfigAsync();
    results.controllerConfig = config;
    console.log('Controller Type:', config.controllerType);
    console.log('Degrees C:', config.degC);
    console.log('Min/Max Pool Temp:', config.minSetPoint?.[0], '-', config.maxSetPoint?.[0]);
    console.log('Min/Max Spa Temp:', config.minSetPoint?.[1], '-', config.maxSetPoint?.[1]);
    console.log('\nEquipment Flags:');
    Object.entries(config.equipment || {}).forEach(([key, val]) => {
      if (val) console.log('  ✅', key);
    });
    console.log('\nCircuits:');
    config.circuitArray?.forEach(c => {
      console.log(`  [${c.circuitId}] ${c.name} (function: ${c.function}, interface: ${c.interface})`);
    });
    console.log('\nColors Available:');
    config.colorArray?.forEach(c => {
      console.log(`  🎨 ${c.name}: rgb(${c.color.r}, ${c.color.g}, ${c.color.b})`);
    });
  } catch (e) { console.log('Error:', e.message); }

  // 3. EQUIPMENT STATE
  console.log('\n' + '='.repeat(60));
  console.log('📊 EQUIPMENT STATE');
  console.log('='.repeat(60));
  try {
    const state = await client.equipment.getEquipmentStateAsync();
    results.equipmentState = state;
    console.log('Air Temp:', state.airTemp, '°F');
    console.log('Freeze Mode:', state.freezeMode ? 'ON' : 'OFF');
    console.log('Panel Mode:', state.panelMode);
    console.log('\nBodies:');
    state.bodies?.forEach((b, i) => {
      const names = ['Pool', 'Spa'];
      console.log(`  ${names[i] || 'Body ' + i}: ${b.currentTemp}°F (set: ${b.setPoint}°F, heat mode: ${b.heatMode}, heating: ${b.heatStatus ? 'YES' : 'NO'})`);
    });
    console.log('\nCircuit States:');
    state.circuitArray?.forEach(c => {
      console.log(`  [${c.id}] ${c.state ? '🟢 ON' : '⚫ OFF'}`);
    });
  } catch (e) { console.log('Error:', e.message); }

  // 4. EQUIPMENT CONFIGURATION
  console.log('\n' + '='.repeat(60));
  console.log('🔧 EQUIPMENT CONFIGURATION');
  console.log('='.repeat(60));
  try {
    const equipConfig = await client.equipment.getEquipmentConfigurationAsync();
    results.equipmentConfiguration = equipConfig;
    console.log(JSON.stringify(equipConfig, null, 2));
  } catch (e) { console.log('Error:', e.message); }

  // 5. CIRCUIT DEFINITIONS
  console.log('\n' + '='.repeat(60));
  console.log('💡 CIRCUIT DEFINITIONS');
  console.log('='.repeat(60));
  try {
    const circuitDefs = await client.equipment.getCircuitDefinitionsAsync();
    results.circuitDefinitions = circuitDefs;
    console.log(JSON.stringify(circuitDefs, null, 2));
  } catch (e) { console.log('Error:', e.message); }

  // 6. SCHEDULES
  console.log('\n' + '='.repeat(60));
  console.log('📅 SCHEDULES');
  console.log('='.repeat(60));
  try {
    // Type 0 = recurring, Type 1 = run-once
    const recurringSchedules = await client.schedule.getScheduleDataAsync(0);
    results.recurringSchedules = recurringSchedules;
    console.log('Recurring Schedules:');
    if (recurringSchedules.eventCount > 0) {
      recurringSchedules.events?.forEach(e => {
        console.log(`  Schedule ${e.scheduleId}: Circuit ${e.circuitId}, ${formatTime(e.startTime)} - ${formatTime(e.stopTime)}, Days: ${formatDays(e.dayMask)}`);
      });
    } else {
      console.log('  (none)');
    }
    
    const runOnceSchedules = await client.schedule.getScheduleDataAsync(1);
    results.runOnceSchedules = runOnceSchedules;
    console.log('\nRun-Once Schedules:');
    if (runOnceSchedules.eventCount > 0) {
      runOnceSchedules.events?.forEach(e => {
        console.log(`  Schedule ${e.scheduleId}: Circuit ${e.circuitId}, ${formatTime(e.startTime)} - ${formatTime(e.stopTime)}`);
      });
    } else {
      console.log('  (none)');
    }
  } catch (e) { console.log('Error:', e.message); }

  // 7. PUMPS
  console.log('\n' + '='.repeat(60));
  console.log('🔄 PUMPS');
  console.log('='.repeat(60));
  try {
    for (let pumpId = 0; pumpId < 8; pumpId++) {
      try {
        const pump = await client.pump.getPumpStatusAsync(pumpId);
        if (pump && (pump.pumpType !== 0 || pump.isRunning)) {
          results[`pump_${pumpId}`] = pump;
          console.log(`\nPump ${pumpId}:`);
          console.log('  Type:', pump.pumpType);
          console.log('  Running:', pump.isRunning ? 'YES' : 'NO');
          console.log('  Watts:', pump.watts);
          console.log('  RPM:', pump.rpm);
          console.log('  GPM:', pump.gpm);
          if (pump.pumpCircuits) {
            console.log('  Circuits:');
            pump.pumpCircuits.forEach((pc, i) => {
              if (pc.circuitId > 0) {
                console.log(`    Circuit ${pc.circuitId}: ${pc.speed} ${pc.isRPM ? 'RPM' : 'GPM'}`);
              }
            });
          }
        }
      } catch (e) { /* pump doesn't exist */ }
    }
  } catch (e) { console.log('Error:', e.message); }

  // 8. CHEMISTRY
  console.log('\n' + '='.repeat(60));
  console.log('🧪 CHEMISTRY');
  console.log('='.repeat(60));
  try {
    const chem = await client.chem.getChemicalDataAsync();
    results.chemistry = chem;
    console.log('pH:', chem.pH ? (chem.pH / 100).toFixed(2) : 'N/A');
    console.log('ORP:', chem.orp, 'mV');
    console.log('Salt:', chem.saltPPM, 'PPM');
    console.log('Saturation Index:', chem.saturation);
    console.log('pH Tank Level:', chem.pHTank);
    console.log('ORP Tank Level:', chem.orpTank);
    console.log('Calcium:', chem.calcium);
    console.log('Cyanuric Acid:', chem.cypiracticAcid);
    console.log('Alkalinity:', chem.alkalinity);
  } catch (e) { console.log('Error:', e.message); }

  // 9. CHLORINATOR (IntelliChlor)
  console.log('\n' + '='.repeat(60));
  console.log('🧂 CHLORINATOR');
  console.log('='.repeat(60));
  try {
    const chlor = await client.chlor.getIntellichlorConfigAsync();
    results.chlorinator = chlor;
    console.log('Installed:', chlor.installed ? 'YES' : 'NO');
    if (chlor.installed) {
      console.log('Pool Output:', chlor.poolSetpoint, '%');
      console.log('Spa Output:', chlor.spaSetpoint, '%');
      console.log('Salt Level:', chlor.saltPPM, 'PPM');
      console.log('Status:', chlor.status);
    }
  } catch (e) { console.log('Error:', e.message); }

  // 10. SYSTEM TIME
  console.log('\n' + '='.repeat(60));
  console.log('🕐 SYSTEM TIME');
  console.log('='.repeat(60));
  try {
    const time = await client.equipment.getSystemTimeAsync();
    results.systemTime = time;
    console.log('Date:', `${time.month}/${time.dayOfMonth}/${time.year}`);
    console.log('Time:', `${time.hour}:${String(time.minute).padStart(2, '0')}:${String(time.second).padStart(2, '0')}`);
    console.log('DST:', time.daylightSavingsActive ? 'Active' : 'Inactive');
  } catch (e) { console.log('Error:', e.message); }

  // 11. WEATHER
  console.log('\n' + '='.repeat(60));
  console.log('🌤️  WEATHER FORECAST');
  console.log('='.repeat(60));
  try {
    const weather = await client.equipment.getWeatherForecastAsync();
    results.weather = weather;
    console.log('Version:', weather.version);
    if (weather.forecast) {
      weather.forecast.forEach((day, i) => {
        console.log(`  Day ${i}: High ${day.highTemp}°, Low ${day.lowTemp}°`);
      });
    }
  } catch (e) { console.log('Error:', e.message); }

  // 12. CUSTOM NAMES
  console.log('\n' + '='.repeat(60));
  console.log('📝 CUSTOM NAMES');
  console.log('='.repeat(60));
  try {
    const names = await client.equipment.getCustomNamesAsync();
    results.customNames = names;
    names.names?.forEach((name, i) => {
      if (name && name.trim()) {
        console.log(`  [${i}] ${name}`);
      }
    });
  } catch (e) { console.log('Error:', e.message); }

  // 13. HISTORY (last 24 hours)
  console.log('\n' + '='.repeat(60));
  console.log('📈 HISTORY (sample)');
  console.log('='.repeat(60));
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const history = await client.equipment.getHistoryDataAsync(yesterday, now);
    results.historySample = { available: !!history, pointCount: history?.airTemps?.length || 0 };
    console.log('History data available:', history ? 'YES' : 'NO');
    if (history?.airTemps?.length) {
      console.log('Data points:', history.airTemps.length);
    }
  } catch (e) { console.log('Error:', e.message); }

  await client.closeAsync();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 FEATURE SUMMARY');
  console.log('='.repeat(60));
  console.log(`
AVAILABLE FEATURES:
  ✅ Temperature monitoring (air, pool, spa)
  ✅ Temperature set points
  ✅ Heat mode control
  ✅ Circuit control (${results.controllerConfig?.circuitCount || '?'} circuits)
  ✅ IntelliBrite color lights (${results.controllerConfig?.colorCount || '?'} colors)
  ✅ Scheduling (recurring + run-once)
  ✅ Pump monitoring${results.controllerConfig?.equipment?.POOL_IFLOWPRESENT0 ? ' (IntelliFlow detected)' : ''}
  ✅ System time
  ${results.controllerConfig?.equipment?.POOL_SOLARPRESENT ? '✅ Solar heating' : '⚫ Solar heating (not detected)'}
  ${results.controllerConfig?.equipment?.POOL_CHLORPRESENT ? '✅ IntelliChlor' : '⚫ IntelliChlor (not detected)'}
  ${results.controllerConfig?.equipment?.POOL_ICHEMPRESENT ? '✅ IntelliChem' : '⚫ IntelliChem (not detected)'}
  ✅ Weather forecast
  ✅ History data

AVAILABLE CONTROLS:
  • Toggle any circuit ON/OFF
  • Set pool/spa temperature (${results.controllerConfig?.minSetPoint?.[0] || '?'}-${results.controllerConfig?.maxSetPoint?.[0] || '?'}°F)
  • Set heat mode (Off, Solar, Solar Preferred, Heater)
  • Change light colors/modes
  • Create/edit/delete schedules
  • Set pump speeds (if IntelliFlow)
  • Set chlorinator output (if IntelliChlor)
  `);

  console.log('\n✅ Discovery complete!');
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDays(mask) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.filter((_, i) => mask & (1 << i)).join(', ') || 'None';
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
