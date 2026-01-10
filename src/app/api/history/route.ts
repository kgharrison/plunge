import { NextRequest, NextResponse } from 'next/server';
import { getCredentialsFromRequest } from '@/lib/api-utils';
import { getHistoryData } from '@/lib/screenlogic';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);

    // Parse optional time range from query params
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    
    // Parse the times from the request
    const fromTimeOriginal = fromParam ? new Date(fromParam) : undefined;
    const toTimeOriginal = toParam ? new Date(toParam) : new Date();

    // WORKAROUND FOR CONTROLLER BUG:
    // The Pentair controller's history API has inconsistent behavior with the fromTime parameter.
    // Data returned consistently starts 16-24+ hours AFTER the requested fromTime, regardless
    // of timezone adjustments. This appears to be a firmware bug or undocumented behavior.
    //
    // Workaround: Request data starting 48 hours earlier than actually needed.
    // The client will filter the results to only show the requested time range.
    
    const BUFFER_HOURS = 48;
    const bufferMs = BUFFER_HOURS * 60 * 60 * 1000;
    
    const fromTime = fromTimeOriginal ? new Date(fromTimeOriginal.getTime() - bufferMs) : undefined;
    const toTime = toTimeOriginal; // Don't buffer the end time

    console.log('[History API] Request:', {
      fromParam,
      toParam,
      bufferHours: BUFFER_HOURS,
      fromTimeOriginalISO: fromTimeOriginal?.toISOString(),
      fromTimeOriginalLocal: fromTimeOriginal?.toLocaleString(),
      fromTimeBufferedISO: fromTime?.toISOString(),
      fromTimeBufferedLocal: fromTime?.toLocaleString(),
    });

    const history = await getHistoryData(fromTime, toTime, credentials);
    
    // Log the range of data returned
    const airTemps = history.airTemps || [];
    if (airTemps.length > 0) {
      console.log('[History API] Data returned:', {
        airTempCount: airTemps.length,
        firstAirTemp: airTemps[0]?.time,
        lastAirTemp: airTemps[airTemps.length - 1]?.time,
      });
    }

    return NextResponse.json(history);
  } catch (error) {
    console.error('Failed to get history data:', error);
    return NextResponse.json(
      { error: 'Failed to get history data', message: (error as Error).message },
      { status: 500 }
    );
  }
}
