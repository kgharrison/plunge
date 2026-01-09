#!/usr/bin/env node
/**
 * Fetch pool status from ScreenLogic
 */

const ScreenLogic = require('node-screenlogic');
const config = require('./config.local.js');

async function getPoolStatus() {
  console.log('🏊 Plunge - Pool Status\n');
  console.log('Connecting to', config.systemName, '...');

  // Connect via remote gateway
  const gateway = new ScreenLogic.RemoteLogin(config.systemName);
  const unit = await gateway.connectAsync();

  if (!unit || !unit.gatewayFound) {
    console.error('❌ Could not find gateway');
    return;
  }

  console.log('✅ Gateway found at', unit.ipAddr + ':' + unit.port);
  await gateway.closeAsync();

  // Connect to the unit
  const client = new ScreenLogic.UnitConnection();
  client.init(config.systemName, unit.ipAddr, unit.port, config.password);
  
  await client.connectAsync();
  console.log('✅ Connected to pool controller\n');

  // Get version
  const version = await client.getVersionAsync();
  console.log('📟 Controller Version:', version.version);

  // Get equipment state
  const state = await client.equipment.getEquipmentStateAsync();
  
  console.log('\n' + '='.repeat(50));
  console.log('🌡️  TEMPERATURES');
  console.log('='.repeat(50));
  
  if (state.bodies) {
    state.bodies.forEach((body, i) => {
      // bodyType: 0=Pool, 1=Spa (typically)
      const names = ['Pool', 'Spa', 'Body 3', 'Body 4'];
      const name = body.name || names[i] || `Body ${i}`;
      console.log(`${name} (type ${body.bodyType}):`);
      console.log(`   Current: ${body.currentTemp}°F`);
      console.log(`   Set Point: ${body.setPoint}°F`);
      console.log(`   Heat Mode: ${getHeatModeName(body.heatMode)}`);
      console.log(`   Heat Status: ${body.heatStatus ? 'ON' : 'OFF'}`);
    });
  }
  
  // Air temp if available
  if (state.airTemp) {
    console.log(`\nAir Temperature: ${state.airTemp}°F`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('⚡ CIRCUITS');
  console.log('='.repeat(50));
  
  if (state.circuitArray) {
    state.circuitArray.forEach((circuit, i) => {
      const status = circuit.state ? '🟢 ON' : '⚫ OFF';
      const name = circuit.name || circuit.circuitName || `Circuit ${circuit.id || i}`;
      console.log(`   [${circuit.id || i}] ${name}: ${status}`);
    });
  }
  
  // Also try to get circuit definitions for names
  try {
    const circuitDefs = await client.equipment.getCircuitDefinitionsAsync();
    if (circuitDefs && circuitDefs.interfaceTabFlags) {
      console.log('\n   📋 Circuit Definitions:');
      console.log('   ', JSON.stringify(circuitDefs, null, 2).split('\n').slice(0, 20).join('\n   '));
    }
  } catch (e) { /* ignore */ }

  // Get pump status
  console.log('\n' + '='.repeat(50));
  console.log('🔄 PUMPS');
  console.log('='.repeat(50));
  
  try {
    for (let pumpId = 0; pumpId < 4; pumpId++) {
      const pump = await client.pump.getPumpStatusAsync(pumpId);
      if (pump && pump.isRunning !== undefined) {
        console.log(`   Pump ${pumpId}: ${pump.isRunning ? '🟢 Running' : '⚫ Off'}`);
        if (pump.watts) console.log(`      Power: ${pump.watts}W`);
        if (pump.rpm) console.log(`      Speed: ${pump.rpm} RPM`);
      }
    }
  } catch (err) {
    console.log('   (Could not fetch pump status)');
  }

  // Get chemistry
  console.log('\n' + '='.repeat(50));
  console.log('🧪 CHEMISTRY');
  console.log('='.repeat(50));
  
  try {
    const chem = await client.chem.getChemicalDataAsync();
    if (chem) {
      if (chem.pH !== undefined) console.log(`   pH: ${chem.pH / 100}`);
      if (chem.orp !== undefined) console.log(`   ORP: ${chem.orp} mV`);
      if (chem.saltPPM !== undefined) console.log(`   Salt: ${chem.saltPPM} PPM`);
      if (chem.saturation !== undefined) console.log(`   Saturation: ${chem.saturation}`);
    }
  } catch (err) {
    console.log('   (No chemistry data available)');
  }

  await client.closeAsync();
  console.log('\n✅ Done');
}

function getHeatModeName(mode) {
  const modes = {
    0: 'Off',
    1: 'Solar',
    2: 'Solar Preferred', 
    3: 'Heater',
    4: 'Don\'t Change'
  };
  return modes[mode] || `Unknown (${mode})`;
}

getPoolStatus().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
