import { NextRequest, NextResponse } from 'next/server';
import { setHeatMode } from '@/lib/screenlogic';
import { getCredentialsFromRequest } from '@/lib/api-utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ body: string }> }
) {
  try {
    const { body } = await params;
    const bodyIndex = body === 'pool' ? 0 : body === 'spa' ? 1 : parseInt(body);
    const data = await request.json();
    const { mode } = data;

    if (typeof mode !== 'number' || mode < 0 || mode > 4) {
      return NextResponse.json(
        { error: 'mode must be a number between 0 and 4' },
        { status: 400 }
      );
    }

    const credentials = getCredentialsFromRequest(request);
    await setHeatMode(bodyIndex, mode, credentials);
    return NextResponse.json({ success: true, body: bodyIndex, mode });
  } catch (error) {
    console.error('Failed to set heat mode:', error);
    return NextResponse.json(
      { error: 'Failed to set heat mode', message: (error as Error).message },
      { status: 500 }
    );
  }
}
