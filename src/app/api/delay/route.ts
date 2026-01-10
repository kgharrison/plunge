import { NextRequest, NextResponse } from 'next/server';
import { cancelDelay } from '@/lib/screenlogic';
import { getCredentialsFromRequest } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// DELETE /api/delay - Cancel all active delays
export async function DELETE(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
    await cancelDelay(credentials);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to cancel delay:', error);
    return NextResponse.json(
      { error: 'Failed to cancel delay', message: (error as Error).message },
      { status: 500 }
    );
  }
}
