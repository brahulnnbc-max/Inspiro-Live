import React from 'react';

interface Props {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
}

/**
 * Authentic Inspiro Brand Mark (Direct Vector Representation of User's Official Asset)
 * Features the signature bold red dots and central 'p' glyph with vertical descender.
 */
export const InspiroLogo: React.FC<Props> = ({
  className = '',
  size = 'md',
  showWordmark = true,
}) => {
  const heights = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-11',
    xl: 'h-16',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Official Symbol Mark */}
      <svg
        viewBox="0 0 200 120"
        className={`${heights[size]} w-auto shrink-0 drop-shadow-[0_2px_10px_rgba(239,35,35,0.25)]`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="inspiro logo mark"
      >
        {/* Left Dot */}
        <circle cx="38" cy="42" r="7.5" fill="#EE1C24" />

        {/* Center 'p' with hollow counter */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M 91 46 H 98 C 108.5 46 117 52.5 117 62 C 117 71.5 108.5 78 98 78 H 98 V 84 H 91 V 46 Z M 98 52 C 105 52 110 56 110 62 C 110 68 105 72 98 72 V 52 Z"
          fill="#EE1C24"
        />

        {/* Vertical tick below 'p' stem */}
        <rect x="91" y="89" width="7" height="19" rx="0.5" fill="#EE1C24" />

        {/* Right Dot */}
        <circle cx="162" cy="42" r="7.5" fill="#EE1C24" />
      </svg>

      {/* Clean, professional brand title */}
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className="font-extrabold tracking-tight text-white text-base sm:text-lg font-sans">
            inspiro <span className="text-red-500 font-bold">LIVE</span>
          </span>
          <span className="text-[9px] tracking-widest text-slate-400 uppercase font-semibold mt-0.5">
            JEE Advanced Sync
          </span>
        </div>
      )}
    </div>
  );
};
