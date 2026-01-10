import { NextRequest } from 'next/server';
import { Credentials } from './screenlogic';

/**
 * Extract credentials from request headers
 * Headers: X-Pool-System-Name, X-Pool-Password
 */
export function getCredentialsFromRequest(request: NextRequest): Credentials | undefined {
  const systemName = request.headers.get('X-Pool-System-Name');
  const password = request.headers.get('X-Pool-Password');
  
  if (systemName && password) {
    return { systemName, password };
  }
  
  return undefined;
}

/**
 * Check if request is in demo mode
 * Demo mode is active when:
 * - NEXT_PUBLIC_DEMO=true env var is set
 * - User's systemName is "demo"
 */
export function isDemoMode(credentials?: Credentials): boolean {
  const demoEnabled = process.env.NEXT_PUBLIC_DEMO === 'true';
  
  // Demo mode not enabled
  if (!demoEnabled) {
    return false;
  }
  
  // Check if user is using demo credentials
  return credentials?.systemName === 'demo';
}

/**
 * Parse session overrides from request headers
 * Used in demo mode to apply user's temporary changes
 */
export function getDemoSessionOverrides(request: NextRequest): {
  circuits?: Record<number, boolean>;
  heatModes?: Record<number, number>;
  setPoints?: Record<number, number>;
} {
  const overridesHeader = request.headers.get('X-Demo-Overrides');
  if (!overridesHeader) {
    return {};
  }
  
  try {
    return JSON.parse(overridesHeader);
  } catch {
    return {};
  }
}
