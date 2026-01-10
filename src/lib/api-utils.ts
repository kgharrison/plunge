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
