'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface EmbeddedLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  [key: string]: any;
}

export default function EmbeddedLink({ href, children, className, ...props }: EmbeddedLinkProps) {
  const searchParams = useSearchParams();
  const isEmbedded = searchParams.get('embedded') === 'true';
  const rotate = searchParams.get('rotate');
  
  // If embedded, preserve the query parameters
  const finalHref = isEmbedded && (rotate === 'true' || rotate === 'false')
    ? `${href}?embedded=true&rotate=${rotate}`
    : href;
  
  return (
    <Link href={finalHref} className={className} {...props}>
      {children}
    </Link>
  );
}
