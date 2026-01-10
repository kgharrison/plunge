import { NextRequest, NextResponse } from 'next/server';
import { getConnectionInfo, clearConnectionCache, discoverLocalUnits, getCredentials } from '@/lib/screenlogic';
import { getCredentialsFromRequest } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const requestCredentials = getCredentialsFromRequest(request);
    const credentials = getCredentials(requestCredentials);
    const connInfo = await getConnectionInfo(credentials);
    const localUnits = await discoverLocalUnits(1500);
    
    return NextResponse.json({
      ...connInfo,
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
