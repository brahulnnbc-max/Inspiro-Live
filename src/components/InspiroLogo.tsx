import React from 'react';

interface Props {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
}

/**
 * Inspiro Brand Mark (Typography Only)
 * - "inspiro" in crisp, bold, modern white
 * - "LIVE" in vibrant red
 * Clean, bold, and professional.
 */
export const InspiroLogo: React.FC<Props> = ({
  className = '',
  size = 'md',
}) => {
  const sizeClasses = {
    sm: {
      title: 'text-base sm:text-lg',
      live: 'text-base sm:text-lg ml-1.5',
    },
    md: {
      title: 'text-xl sm:text-2xl',
      live: 'text-xl sm:text-2xl ml-2',
    },
    lg: {
      title: 'text-3xl sm:text-4xl',
      live: 'text-3xl sm:text-4xl ml-2.5',
    },
    xl: {
      title: 'text-4xl sm:text-5xl',
      live: 'text-4xl sm:text-5xl ml-3',
    },
  };

  const current = sizeClasses[size];

  return (
    <div className={`inline-flex items-center select-none font-sans leading-none ${className}`}>
      {/* inspiro in white */}
      <span className={`font-black tracking-tight text-white ${current.title} drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]`}>
        inspiro
      </span>

      {/* LIVE in red */}
      <span className={`font-black tracking-wider text-red-500 uppercase ${current.live} drop-shadow-[0_0_12px_rgba(239,68,68,0.4)]`}>
        LIVE
      </span>
    </div>
  );
};
