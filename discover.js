#!/usr/bin/env node
/**
 * Discovery script to find your pool controller
 * Tries both node-intellicenter and node-screenlogic (local + remote)
 */

const { FindUnits: FindIntelliCenter } = require('node-intellicenter');
const ScreenLogic = require('node-screenlogic');
const fs = require('fs');
const path = require('path');

// Load config from file or command line
let config = { systemName: null, password: null };
const configPath = path.join(__dirname, 'config.local.js');
if (fs.existsSync(configPath)) {
  config = require(configPath);
  console.log('📁 Loaded config from config.local.js');
}

// Command line args override config file
const systemName = process.argv[2] || config.systemName;
const password = process.argv[3] || config.password;

async function discoverIntelliCenter() {
  console.log('\n🔍 Searching for IntelliCenter units (local, port 6680)...');
  try {
    const finder = new FindIntelliCenter();
    const units = await finder.searchAsync(3000); // 3 second timeout
    if (units && units.length > 0) {
      console.log('✅ Found IntelliCenter unit(s):');
      units.forEach((unit, i) => {
        console.log(`   ${i + 1}. ${unit.addressStr}:${unit.port}`);
        console.log(`      Name: ${unit.name || 'Unknown'}`);
      });
      return units;
    } else {
      console.log('   No IntelliCenter units found locally');
      return [];
    }
  } catch (err) {
    console.log('   Error searching for IntelliCenter:', err.message);
    return [];
  }
}

async function discoverScreenLogicRemote(systemName) {
  if (!systemName) {
    console.log('\n🌐 Remote ScreenLogic: Skipped (no system name provided)');
    console.log('   To test remote: node discover.js "Pentair: xx-xx-xx"');
    return null;
  }
  
  console.log(`\n🌐 Connecting to ScreenLogic remotely: ${systemName}...`);
  try {
    const gateway = new ScreenLogic.RemoteLogin(systemName);
    const unit = await gateway.connectAsync();
    
    if (unit && unit.gatewayFound) {
      console.log('✅ Remote connection successful!');
      console.log(`   Gateway IP: ${unit.ipAddr}`);
      console.log(`   Port: ${unit.port}`);
      await gateway.closeAsync();
      return unit;
    } else {
      console.log('   Remote gateway not found');
      await gateway.closeAsync();
      return null;
    }
  } catch (err) {
    console.log('   Error connecting remotely:', err.message);
    return null;
  }
}

async function discoverScreenLogic() {
  console.log('\n🔍 Searching for ScreenLogic units (port 1444)...');
  return new Promise((resolve) => {
    try {
      const finder = new ScreenLogic.FindUnits();
      const units = [];
      
      finder.on('serverFound', (server) => {
        units.push(server);
        console.log('✅ Found ScreenLogic unit:');
        console.log(`   Address: ${server.address}:${server.port}`);
        console.log(`   Gateway: ${server.gatewayName}`);
        console.log(`   Type: ${server.gatewayType}`);
      });

      finder.search();
      
      // Wait 3 seconds for responses
      setTimeout(() => {
        finder.close();
        if (units.length === 0) {
          console.log('   No ScreenLogic units found');
        }
        resolve(units);
      }, 3000);
    } catch (err) {
      console.log('   Error searching for ScreenLogic:', err.message);
      resolve([]);
    }
  });
}

async function main() {
  console.log('='.repeat(50));
  console.log('🏊 Plunge - Pool Controller Discovery');
  console.log('='.repeat(50));

  // Run local discovery in parallel
  const [intellicenterUnits, screenlogicUnits] = await Promise.all([
    discoverIntelliCenter(),
    discoverScreenLogic()
  ]);

  // Try remote if system name provided
  const remoteUnit = await discoverScreenLogicRemote(systemName);

  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log(`   IntelliCenter (local): ${intellicenterUnits.length} found`);
  console.log(`   ScreenLogic (local):   ${screenlogicUnits.length} found`);
  console.log(`   ScreenLogic (remote):  ${remoteUnit ? '✅ Connected' : 'Not tested'}`);
  
  if (remoteUnit) {
    console.log('\n💡 Recommendation: Use node-screenlogic with remote connection');
  } else if (intellicenterUnits.length > 0) {
    console.log('\n💡 Recommendation: Use node-intellicenter library');
  } else if (screenlogicUnits.length > 0) {
    console.log('\n💡 Recommendation: Use node-screenlogic library');
  } else {
    console.log('\n⚠️  No units found locally. Try remote connection:');
    console.log('   node discover.js "Pentair: xx-xx-xx"');
    console.log('\n   Find your system name in ScreenLogic app settings.');
  }
  
  console.log('='.repeat(50));
}

main().catch(console.error);
