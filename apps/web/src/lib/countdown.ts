import { useEffect, useState } from 'react';

export function useCountdown(targetIso: string): number {
  const compute = () => Math.max(0, new Date(targetIso).getTime() - Date.now());
  const [ms, setMs] = useState(compute);

  useEffect(() => {
    setMs(compute());
    const id = setInterval(() => {
      setMs(compute());
    }, 1_000);
    return () => clearInterval(id);
  }, [targetIso]);

  return ms;
}
