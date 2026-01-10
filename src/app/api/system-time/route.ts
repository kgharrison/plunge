import { NextRequest, NextResponse } from 'next/server';
import { getCredentialsFromRequest } from '@/lib/api-utils';
import { getSystemTime } from '@/lib/screenlogic';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
    const systemTime = await getSystemTime(credentials);
    
    // The controller returns its current local time
    // Compare to server's current UTC time to calculate the offset
    const serverNow = new Date();
    const controllerTime = systemTime.date;
    
    // Calculate the offset in hours
    // If controller is in Pacific (UTC-8) and shows 4:00 PM,
    // and server UTC is 12:00 AM (midnight), offset would be -8 hours
    const offsetMs = controllerTime.getTime() - serverNow.getTime();
    const offsetHours = Math.round(offsetMs / (60 * 60 * 1000));
    
    console.log('[System Time API]', {
      controllerTime: controllerTime.toISOString(),
      controllerTimeLocal: controllerTime.toLocaleString(),
      serverNow: serverNow.toISOString(),
      serverNowLocal: serverNow.toLocaleString(),
      offsetHours,
      adjustForDST: systemTime.adjustForDST,
    });

    return NextResponse.json({
      controllerTime: controllerTime.toISOString(),
      serverTime: serverNow.toISOString(),
      offsetHours,
      adjustForDST: systemTime.adjustForDST,
    });
  } catch (error) {
    console.error('Failed to get system time:', error);
    return NextResponse.json(
      { error: 'Failed to get system time', message: (error as Error).message },
      { status: 500 }
    );
  }
}
