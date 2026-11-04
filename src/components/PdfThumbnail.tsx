import React, { useEffect, useRef } from 'react';
import { SlideDescriptor } from '../types';
import { renderSlideThumbnailToCanvas } from '../lib/pdfEngine';

interface PdfThumbnailProps {
  slide?: SlideDescriptor;
  className?: string;
}

export const PdfThumbnail: React.FC<PdfThumbnailProps> = ({
  slide,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !slide) return;
    let cancelled = false;

    renderSlideThumbnailToCanvas(canvas, slide, 480).catch(() => {
      if (!cancelled) {
        // Leave dark chalkboard background fallback
      }
    });

    return () => {
      cancelled = true;
    };
  }, [slide]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full object-cover bg-[#2B2B2E] ${className}`}
    />
  );
};
