import { useEffect, useRef, useState, type ReactNode } from 'react';

interface LazyChartProps {
  children: ReactNode;
  className?: string;
  /** Minimum height to reserve before the chart loads */
  minHeight?: number;
}

/**
 * Defers rendering of a chart component until it enters (or is near) the viewport.
 * Prevents off-screen charts from blocking the main thread during filter changes.
 */
export function LazyChart({ children, className, minHeight = 400 }: LazyChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }, // start loading 200px before entering viewport
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} style={visible ? undefined : { minHeight }}>
      {visible ? children : null}
    </div>
  );
}
