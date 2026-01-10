import { NextRequest, NextResponse } from 'next/server';
import { getSchedules, createSchedule } from '@/lib/screenlogic';
import { getCredentialsFromRequest, isDemoMode } from '@/lib/api-utils';
import { getDemoSchedules, createDemoSchedule } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/schedules - Get all schedules (recurring and run-once)
 */
export async function GET(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
    
    if (isDemoMode(credentials)) {
      const schedules = await getDemoSchedules();
      return NextResponse.json(schedules);
    }
    
    const schedules = await getSchedules(credentials);
    return NextResponse.json(schedules);
  } catch (error) {
    console.error('Failed to get schedules:', error);
    return NextResponse.json(
      { error: 'Failed to get schedules', message: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/schedules - Create a new schedule
 * Body: { scheduleType, circuitId, startTime, stopTime, dayMask, flags?, heatCmd?, heatSetPoint? }
 */
export async function POST(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
    
    if (isDemoMode(credentials)) {
      const scheduleId = await createDemoSchedule();
      return NextResponse.json({ scheduleId, success: true, demo: true });
    }
    
    const body = await request.json();
    
    const {
      scheduleType,
      circuitId,
      startTime,
      stopTime,
      dayMask,
      flags = 0,
      heatCmd = 4,
      heatSetPoint = 0,
    } = body;
    
    if (!scheduleType || !circuitId || startTime === undefined || stopTime === undefined || dayMask === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: scheduleType, circuitId, startTime, stopTime, dayMask' },
        { status: 400 }
      );
    }
    
    const scheduleId = await createSchedule(
      scheduleType,
      circuitId,
      startTime,
      stopTime,
      dayMask,
      flags,
      heatCmd,
      heatSetPoint,
      credentials
    );
    
    return NextResponse.json({ scheduleId, success: true });
  } catch (error) {
    console.error('Failed to create schedule:', error);
    return NextResponse.json(
      { error: 'Failed to create schedule', message: (error as Error).message },
      { status: 500 }
    );
  }
}
