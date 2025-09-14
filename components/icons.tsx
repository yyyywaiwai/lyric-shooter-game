import React from 'react';

export const UploadIcon = (props: React.SVGProps<SVGSVGElement>): React.ReactNode => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
    />
  </svg>
);

export const BombIcon = (props: React.SVGProps<SVGSVGElement>): React.ReactNode => (
    <svg 
        {...props}
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 24 24" 
        fill="currentColor"
        className={`text-red-500 ${props.className || ''}`}
    >
        <path d="M11.99,2C6.47,2 2,6.48 2,12s4.47,10 9.99,10C17.52,22 22,17.52 22,12S17.52,2 11.99,2zM12,4c1.01,0,1.94,0.25,2.75,0.69L13,6.5V5c0-0.55-0.45-1-1-1s-1,0.45-1,1v1.5L9.25,4.69C10.06,4.25,10.99,4,12,4zM8,17c-0.55,0-1-0.45-1-1s0.45-1,1-1s1,0.45,1,1S8.55,17,8,17zM16,17c-0.55,0-1-0.45-1-1s0.45-1,1-1s1,0.45,1,1S16.55,17,16,17zM12,14c-1.1,0-2-0.9-2-2s0.9-2,2-2s2,0.9,2,2S13.1,14,12,14z" />
    </svg>
);

export const SpeedUpIcon = (props: React.SVGProps<SVGSVGElement>): React.ReactNode => (
    <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`text-blue-400 ${props.className || ''}`}
    >
        <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" />
        <path d="M4 4h16v2H4z" />
    </svg>
);

export const DiagonalShotIcon = (props: React.SVGProps<SVGSVGElement>): React.ReactNode => (
    <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`text-green-400 ${props.className || ''}`}
    >
        <path d="M11 9.41V4h2v5.41l5.29-5.3L19.7 5.51 14.19 11h5.1v2h-5.1l5.51 5.49-1.41 1.41L13 14.59V20h-2v-5.41l-5.29 5.3-1.41-1.41L9.81 13H4.7v-2h5.1L4.3 5.51 5.71 4.1 11 9.41z" />
    </svg>
);

export const LaserIcon = (props: React.SVGProps<SVGSVGElement>): React.ReactNode => (
    <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`text-orange-500 ${props.className || ''}`}
    >
        <path d="M5 13h14v-2H5v2zm-2 4h14v-2H3v2zM7 7v2h14V7H7z" />
    </svg>
);

export const PhaseShieldIcon = (props: React.SVGProps<SVGSVGElement>): React.ReactNode => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`text-sky-300 ${props.className || ''}`}
  >
    {/* Shield */}
    <path d="M12 2l7 3v6c0 5-3.5 9-7 11-3.5-2-7-6-7-11V5l7-3z" fill="currentColor" opacity="0.25"/>
    <path d="M12 2l7 3v6c0 5-3.5 9-7 11-3.5-2-7-6-7-11V5l7-3z" />
    {/* Phase spark */}
    <circle cx="12" cy="10" r="2" fill="currentColor" />
  </svg>
);

export const OneUpIcon = (props: React.SVGProps<SVGSVGElement>): React.ReactNode => (
    <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`text-pink-400 ${props.className || ''}`}
    >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.5 13.5h-2v-2h-3v2h-2v-7h2v2h3v-2h2v7z" />
    </svg>
);

export const PlayerShipIcon = (props: React.SVGProps<SVGSVGElement>): React.ReactNode => (
    <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
    >
        <path d="M12 2L2 19.75l10-4.25 10 4.25L12 2z" />
        <path d="M12 11.5L3.5 15.5 2 19.75l10-4.25V11.5z" opacity=".5" />
    </svg>
);

export const SideShotIcon = (props: React.SVGProps<SVGSVGElement>): React.ReactNode => (
    <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`text-cyan-400 ${props.className || ''}`}
    >
        <path d="M5 11h14v2H5z" />
        <path d="M4 12l4-4v8z" />
        <path d="M20 12l-4-4v8z" />
    </svg>
);

export const CancellerShotIcon = (props: React.SVGProps<SVGSVGElement>): React.ReactNode => (
    <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`text-purple-400 ${props.className || ''}`}
    >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" opacity="0.4" />
        <path d="M4.93 17.66l12.73-12.73 1.41 1.41L6.34 19.07z" />
    </svg>
);

export const RicochetShotIcon = (props: React.SVGProps<SVGSVGElement>): React.ReactNode => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`text-rose-400 ${props.className || ''}`}
  >
    {/* Corner-left arrow (centered to chevron) */}
    <path d="M20 4v4a4 4 0 0 1-4 4H9" />
    <polyline points="9 8 5 12 9 16" />
  </svg>
  );
