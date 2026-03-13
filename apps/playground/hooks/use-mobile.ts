'use client';

import { useEffect, useState } from 'react';

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const onChange = () => {
      setIsMobile(window.innerWidth < 768);
    };
    mql.addEventListener('change', onChange);
    setIsMobile(window.innerWidth < 768);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
