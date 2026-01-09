#!/usr/bin/env node
/**
 * Get controller configuration including circuit names
 */

const ScreenLogic = require('node-screenlogic');
const config = require('./config.local.js');

async function main() {
  const gateway = new ScreenLogic.RemoteLogin(config.systemName);
  const unit = await gateway.connectAsync();
  await gateway.closeAsync();
  
  const client = new ScreenLogic.UnitConnection();
  client.init(config.systemName, unit.ipAddr, unit.port, config.password);
  await client.connectAsync();
  console.log('✅ Connected\n');

  // Get controller config (includes circuit names)
  console.log('📋 Controller Configuration:');
  const controllerConfig = await client.equipment.getControllerConfigAsync();
  console.log(JSON.stringify(controllerConfig, null, 2));

  await client.closeAsync();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
