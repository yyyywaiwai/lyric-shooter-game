import React from 'react';

interface ProgressCircleProps {
  size: number; // px
  strokeWidth?: number; // px
  progress: number; // 0..1 (remaining or filled)
  className?: string; // color via text-*
  trackClassName?: string; // track color via text-*
}

export default function ProgressCircle({ size, strokeWidth = 4, progress, className = 'text-amber-400', trackClassName = 'text-slate-700' }: ProgressCircleProps): React.ReactNode {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const dashOffset = circumference * (1 - clamped);

  return (
    <svg width={size} height={size} className="block" viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        className={trackClassName}
        strokeWidth={strokeWidth}
        opacity={0.35}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        className={className}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
      />
    </svg>
  );
}

