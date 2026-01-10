import { NextRequest, NextResponse } from 'next/server';
import { updateSchedule, deleteSchedule } from '@/lib/screenlogic';
import { getCredentialsFromRequest } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/schedules/[id] - Update a schedule
 * Body: { circuitId, startTime, stopTime, dayMask, flags?, heatCmd?, heatSetPoint? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const scheduleId = parseInt(id, 10);
    
    if (isNaN(scheduleId)) {
      return NextResponse.json(
        { error: 'Invalid schedule ID' },
        { status: 400 }
      );
    }
    
    const credentials = getCredentialsFromRequest(request);
    const body = await request.json();
    
    const {
      circuitId,
      startTime,
      stopTime,
      dayMask,
      flags = 0,
      heatCmd = 4,
      heatSetPoint = 0,
    } = body;
    
    if (!circuitId || startTime === undefined || stopTime === undefined || dayMask === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: circuitId, startTime, stopTime, dayMask' },
        { status: 400 }
      );
    }
    
    await updateSchedule(
      scheduleId,
      circuitId,
      startTime,
      stopTime,
      dayMask,
      flags,
      heatCmd,
      heatSetPoint,
      credentials
    );
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update schedule:', error);
    return NextResponse.json(
      { error: 'Failed to update schedule', message: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/schedules/[id] - Delete a schedule
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const scheduleId = parseInt(id, 10);
    
    if (isNaN(scheduleId)) {
      return NextResponse.json(
        { error: 'Invalid schedule ID' },
        { status: 400 }
      );
    }
    
    const credentials = getCredentialsFromRequest(request);
    await deleteSchedule(scheduleId, credentials);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete schedule:', error);
    return NextResponse.json(
      { error: 'Failed to delete schedule', message: (error as Error).message },
      { status: 500 }
    );
  }
}
