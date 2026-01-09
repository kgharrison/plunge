#!/usr/bin/env node
/**
 * Control pool equipment via ScreenLogic
 * Usage: 
 *   node pool-control.js status
 *   node pool-control.js circuit <id> on|off
 *   node pool-control.js heat <pool|spa> <temp>
 */

const ScreenLogic = require('node-screenlogic');
const config = require('./config.local.js');

async function connect() {
  const gateway = new ScreenLogic.RemoteLogin(config.systemName);
  const unit = await gateway.connectAsync();
  
  if (!unit || !unit.gatewayFound) {
    throw new Error('Could not find gateway');
  }
  
  await gateway.closeAsync();
  
  const client = new ScreenLogic.UnitConnection();
  client.init(config.systemName, unit.ipAddr, unit.port, config.password);
  await client.connectAsync();
  
  return client;
}

async function getStatus(client) {
  const state = await client.equipment.getEquipmentStateAsync();
  
  console.log('\n🏊 Pool Status\n');
  
  // Bodies (Pool/Spa temps)
  if (state.bodies) {
    const names = ['Pool', 'Spa'];
    state.bodies.forEach((body, i) => {
      console.log(`${names[i] || 'Body ' + i}: ${body.currentTemp}°F (set: ${body.setPoint}°F)`);
    });
  }
  
  console.log('\nCircuits:');
  if (state.circuitArray) {
    state.circuitArray.forEach((circuit, i) => {
      const status = circuit.state ? '🟢' : '⚫';
      console.log(`  ${status} [${circuit.id || i}] ${circuit.name || 'Circuit ' + (circuit.id || i)}`);
    });
  }
  
  return state;
}

async function setCircuit(client, circuitId, state) {
  const on = state === 'on' || state === '1' || state === true;
  console.log(`Setting circuit ${circuitId} to ${on ? 'ON' : 'OFF'}...`);
  await client.circuits.setCircuitStateAsync(parseInt(circuitId), on ? 1 : 0);
  console.log('✅ Done');
}

async function setHeatPoint(client, body, temp) {
  const bodyId = body === 'spa' ? 1 : 0;
  console.log(`Setting ${body} heat to ${temp}°F...`);
  await client.bodies.setSetPointAsync(bodyId, parseInt(temp));
  console.log('✅ Done');
}

async function main() {
  const [,, command, ...args] = process.argv;
  
  if (!command || command === 'help') {
    console.log(`
Usage:
  node pool-control.js status           - Show current status
  node pool-control.js circuit <id> on  - Turn circuit on
  node pool-control.js circuit <id> off - Turn circuit off
  node pool-control.js heat pool <temp> - Set pool temp
  node pool-control.js heat spa <temp>  - Set spa temp
  node pool-control.js raw              - Dump raw state JSON
`);
    return;
  }
  
  const client = await connect();
  console.log('✅ Connected');
  
  try {
    switch (command) {
      case 'status':
        await getStatus(client);
        break;
        
      case 'circuit':
        const [circuitId, circuitState] = args;
        if (!circuitId || !circuitState) {
          console.log('Usage: node pool-control.js circuit <id> on|off');
          break;
        }
        await setCircuit(client, circuitId, circuitState);
        break;
        
      case 'heat':
        const [body, temp] = args;
        if (!body || !temp) {
          console.log('Usage: node pool-control.js heat pool|spa <temp>');
          break;
        }
        await setHeatPoint(client, body, temp);
        break;
        
      case 'raw':
        const state = await client.equipment.getEquipmentStateAsync();
        console.log(JSON.stringify(state, null, 2));
        break;
        
      default:
        console.log('Unknown command:', command);
    }
  } finally {
    await client.closeAsync();
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
