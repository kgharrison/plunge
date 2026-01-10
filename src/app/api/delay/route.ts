import { NextRequest, NextResponse } from 'next/server';
import { cancelDelay } from '@/lib/screenlogic';
import { getCredentialsFromRequest, isDemoMode } from '@/lib/api-utils';
import { cancelDemoDelay } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

// DELETE /api/delay - Cancel all active delays
export async function DELETE(request: NextRequest) {
  try {
    const credentials = getCredentialsFromRequest(request);
    
    if (isDemoMode(credentials)) {
      await cancelDemoDelay();
      return NextResponse.json({ success: true, demo: true });
    }
    
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
