import { NextRequest, NextResponse } from 'next/server';
import { setBodyTemperature } from '@/lib/screenlogic';
import { getCredentialsFromRequest } from '@/lib/api-utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ body: string }> }
) {
  try {
    const { body } = await params;
    const bodyIndex = body === 'pool' ? 0 : body === 'spa' ? 1 : parseInt(body);
    const data = await request.json();
    const { temp } = data;

    if (typeof temp !== 'number' || temp < 40 || temp > 104) {
      return NextResponse.json(
        { error: 'temp must be a number between 40 and 104' },
        { status: 400 }
      );
    }

    const credentials = getCredentialsFromRequest(request);
    await setBodyTemperature(bodyIndex, temp, credentials);
    return NextResponse.json({ success: true, body: bodyIndex, temp });
  } catch (error) {
    console.error('Failed to set temperature:', error);
    return NextResponse.json(
      { error: 'Failed to set temperature', message: (error as Error).message },
      { status: 500 }
    );
  }
}
