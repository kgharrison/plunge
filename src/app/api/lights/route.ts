import { NextRequest, NextResponse } from 'next/server';
import { sendLightCommand } from '@/lib/screenlogic';
import { getCredentialsFromRequest } from '@/lib/api-utils';

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
