import { SlideDescriptor, SlideSourceType } from '../types';

export const ELECTROSTATICS_PDF_URL =
  '/assets/aistudio/Electrostatics__Notes__910fc09c.pdf';

export const ELECTROSTATICS_TOTAL_PDF_PAGES = 376;

// Pure blank transition boards in Electrostatics__Notes__910fc09c.pdf so live timer never wastes 50s on an empty screen
const BLANK_PAGES_SET = new Set<number>([86, 87, 103, 276, 292, 376]);

export function buildElectrostaticsChapterSlides(): SlideDescriptor[] {
  const slides: SlideDescriptor[] = [];
  for (let p = 1; p <= ELECTROSTATICS_TOTAL_PDF_PAGES; p++) {
    if (BLANK_PAGES_SET.has(p)) continue;
    slides.push({
      index: slides.length,
      label: `Page ${String(p).padStart(3, '0')}`,
      sourceType: SlideSourceType.STATIC_PDF_URL,
      pdfUrl: ELECTROSTATICS_PDF_URL,
      pdfPageNumber: p,
    });
  }
  return slides;
}
