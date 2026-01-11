import { NextRequest, NextResponse } from 'next/server';
import { getConnectionInfo, clearConnectionCache, discoverLocalUnits, getCredentials, CONNECTION_MODE } from '@/lib/screenlogic';
import { getCredentialsFromRequest, isDemoMode } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const requestCredentials = getCredentialsFromRequest(request);
    
    // Demo mode - return fake connection info
    if (isDemoMode(requestCredentials)) {
      return NextResponse.json({
        type: 'demo',
        systemName: 'demo',
        connectionMode: 'demo',
        localAvailable: false,
        localUnits: []
      });
    }
    
    const credentials = getCredentials(requestCredentials);
    const connInfo = await getConnectionInfo(credentials);
    
    // Only discover local units if connection mode allows local connections
    const localUnits = CONNECTION_MODE !== 'remote' ? await discoverLocalUnits(1500) : [];
    
    return NextResponse.json({
      ...connInfo,
      connectionMode: CONNECTION_MODE,
      localAvailable: localUnits.length > 0,
      localUnits: localUnits.map(u => ({
        address: u.address,
        gatewayName: u.gatewayName
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get connection info', message: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  // Clear connection cache - forces re-discovery on next request
  clearConnectionCache();
  return NextResponse.json({ success: true });
}
