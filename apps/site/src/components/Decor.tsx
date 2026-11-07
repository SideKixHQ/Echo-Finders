import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/** Fade-and-rise scroll entrance wrapper. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

/** Decorative topographic contour lines, stroked with the current text color. */
export function ContourLines({ className }: { className?: string }) {
  const offsets = [-160, -110, -60, 0, 60, 120, 190];
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
      <g stroke="currentColor" strokeWidth="1">
        {offsets.map((dy, i) => (
          <path
            key={i}
            transform={'translate(0 ' + dy + ')'}
            opacity={0.25 + (i % 3) * 0.12}
            d="M-120 640 C 180 540, 380 720, 660 640 S 1080 480, 1580 600"
          />
        ))}
        <path opacity="0.5" strokeWidth="1.5" strokeDasharray="2 10" d="M120 860 C 320 700, 480 760, 700 640 S 1100 520, 1340 420" />
        <path opacity="0.4" strokeWidth="1.5" strokeDasharray="2 10" d="M980 900 C 1060 760, 940 640, 1040 520 S 1240 320, 1400 260" />
      </g>
    </svg>
  );
}

/** The signature motif: a glowing waypoint pin with slow sonar pulse rings. */
export function WaypointPin({ className = '', dotClassName = '' }: { className?: string; dotClassName?: string }) {
  return (
    <div className={'pointer-events-none relative flex h-16 w-16 items-center justify-center ' + className}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className="absolute inset-0 rounded-full border border-[hsl(var(--echo-gold))]"
          initial={{ scale: 0.25, opacity: 0.7 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 3.2, delay: i * 1.0, ease: 'easeOut' }}
        />
      ))}
      <span
        aria-hidden="true"
        className={
          'relative h-3 w-3 rounded-full bg-[hsl(var(--echo-gold))] shadow-[0_0_16px_4px_hsl(var(--echo-gold)/0.55)] ' +
          dotClassName
        }
      />
    </div>
  );
}

/** A subtle animated audio waveform. */
export function WaveformBars({ className = '' }: { className?: string }) {
  const bars = [0.9, 0.5, 1.1, 0.7, 1.3, 0.6, 1.0, 0.45, 1.2, 0.75];
  return (
    <div className={'flex items-center gap-[3px] ' + className} aria-hidden="true">
      {bars.map((h, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-[hsl(var(--accent))]"
          style={{ height: Math.min(h * 14, 20) + 'px' }}
          animate={{ scaleY: [h, h * 0.35, h] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}
