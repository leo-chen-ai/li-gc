import { useEffect, useState, useRef } from "react";

export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 1200,
  className = "",
  suffix = "",
  style,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  suffix?: string;
  style?: React.CSSProperties;
}) {
  // On first mount show the target immediately — avoids 15+ simultaneous
  // rAF loops on initial page load that cause a visible jank spike.
  const isMountedRef = useRef(false);
  const [display, setDisplay] = useState(() => value);
  const startRef = useRef(0);
  const fromRef = useRef(value);
  const toRef = useRef(value);

  useEffect(() => {
    // Skip animation on first mount; only animate subsequent value changes.
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    fromRef.current = display;
    toRef.current = value;
    startRef.current = performance.now();

    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = fromRef.current + (toRef.current - fromRef.current) * ease;
      setDisplay(current);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <span className={className} style={style}>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
