import { NextRequest, NextResponse } from 'next/server';
import { getSystemTime, setSystemTime } from '@/lib/screenlogic';
import { getCredentialsFromRequest } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/config/system - Get system time and DST setting
 */
export async function GET(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
    const systemTime = await getSystemTime(credentials);
    
    return NextResponse.json({
      date: systemTime.date.toISOString(),
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

/**
 * PUT /api/config/system - Set system time and DST
 * Body: { date?: string (ISO), adjustForDST?: boolean, syncWithDevice?: boolean }
 */
export async function PUT(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
    const body = await request.json();
    
    const { date, adjustForDST, syncWithDevice } = body;
    
    // If syncWithDevice is true, use current server time
    const newDate = syncWithDevice ? new Date() : (date ? new Date(date) : new Date());
    
    // Get current DST setting if not provided
    let dstSetting = adjustForDST;
    if (dstSetting === undefined) {
      const current = await getSystemTime(credentials);
      dstSetting = current.adjustForDST;
    }
    
    await setSystemTime(newDate, dstSetting, credentials);
    
    return NextResponse.json({
      success: true,
      date: newDate.toISOString(),
      adjustForDST: dstSetting,
    });
  } catch (error) {
    console.error('Failed to set system time:', error);
    return NextResponse.json(
      { error: 'Failed to set system time', message: (error as Error).message },
      { status: 500 }
    );
  }
}
