import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number | string };
function icon(shapes: React.ReactNode) {
  return function Icon({ size = 24, strokeWidth = 1.8, ...props }: IconProps) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{shapes}</svg>;
  };
}

export const ArrowRight = icon(<><path d="M4 12h15M13 6l6 6-6 6" /></>);
export const ArrowLeft = icon(<><path d="M20 12H5m6-6-6 6 6 6" /></>);
export const ChevronRight = icon(<path d="m9 5 7 7-7 7" />);
export const BookOpen = icon(<><path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15" /><path d="M5 8h3M16 8h3" /></>);
export const Users = icon(<><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m2 9v-2a6 6 0 0 0-2-4" /></>);
export const Heart = icon(<path d="M20 5c-2-2-5-1-8 2-3-3-6-4-8-2s-2 5 0 8l8 8 8-8c2-3 2-6 0-8Z" />);
export const Copy = icon(<><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 5V3H3v13h2" /></>);
export const Check = icon(<path d="m5 12 4 4L20 5" />);
export const Sparkles = icon(<><path d="m13 3 2.3 6.7L22 12l-6.7 2.3L13 21l-2.3-6.7L4 12l6.7-2.3L13 3Z" /><path d="m4 2 .8 2.2L7 5l-2.2.8L4 8l-.8-2.2L1 5l2.2-.8L4 2Z" /></>);
export const X = icon(<path d="m5 5 14 14M19 5 5 19" />);
export const Trophy = icon(<><path d="M7 3h10v7a5 5 0 0 1-10 0V3ZM7 5H3v3a5 5 0 0 0 5 5m9-8h4v3a5 5 0 0 1-5 5M12 15v6M7 21h10" /></>);
export const Wifi = icon(<><path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0" /><circle cx="12" cy="20" r=".8" fill="currentColor" /></>);
export const WifiOff = icon(<><path d="m3 3 18 18M2 8a16 16 0 0 1 4-2m5-2a16 16 0 0 1 11 4M5 12a11 11 0 0 1 5-2m6 0 3 2m-11 4a6 6 0 0 1 5-1" /><circle cx="12" cy="20" r=".8" fill="currentColor" /></>);
export const LogOut = icon(<><path d="M9 4H3v16h6m5-13 5 5-5 5m-7-5h12" /></>);
export const Play = icon(<path d="m7 3 15 9-15 9V3Z" />);
export const LoaderCircle = icon(<path d="M20 12a8 8 0 1 1-8-8" />);
export const HelpCircle = icon(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .5-1.5 1-1.5 2" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></>);
export const CheckCircle2 = icon(<><circle cx="12" cy="12" r="9" /><path d="m7 12 3 3 7-7" /></>);
export const AlertCircle = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></>);
export const Clock3 = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 6v6h5" /></>);
export const RotateCcw = icon(<><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7" /></>);
export const Share2 = icon(<><circle cx="18" cy="5" r="3" /><circle cx="5" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8 10 7-4m-7 8 7 4" /></>);
