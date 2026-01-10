import { NextRequest, NextResponse } from 'next/server';
import { sendLightCommand } from '@/lib/screenlogic';
import { getCredentialsFromRequest, isDemoMode } from '@/lib/api-utils';
import { sendDemoLightCommand } from '@/lib/demo-data';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { command } = data;

    if (typeof command !== 'number') {
      return NextResponse.json(
        { error: 'command must be a number' },
        { status: 400 }
      );
    }

    const credentials = getCredentialsFromRequest(request);
    
    if (isDemoMode(credentials)) {
      await sendDemoLightCommand(command);
      return NextResponse.json({ success: true, command, demo: true });
    }
    
    await sendLightCommand(command, credentials);
    return NextResponse.json({ success: true, command });
  } catch (error) {
    console.error('Failed to send light command:', error);
    return NextResponse.json(
      { error: 'Failed to send light command', message: (error as Error).message },
      { status: 500 }
    );
  }
}
