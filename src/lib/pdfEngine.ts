import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { BroadcastOrientation, SlideDescriptor, SlideSourceType } from '../types';
import { renderDemoBoardToCanvas } from './demoSlides';
import { getMediaBlob } from './storage';

// Initialize polyfilled PDF.js worker using Vite bundled module Worker (.js MIME-safe) with URL fallback
try {
  const worker = new Worker(
    new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url),
    { type: 'module' }
  );
  pdfjsLib.GlobalWorkerOptions.workerPort = worker;
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

const MAX_CANVAS_PX = 2200; // Prevents GPU/RAM out-of-memory crashes on mobile & high-DPR tabs

const loadedBlobPdfDocs = new Map<string, pdfjsLib.PDFDocumentProxy>();
const loadedUrlPdfDocs = new Map<string, Promise<pdfjsLib.PDFDocumentProxy>>();
const blobObjectUrls = new Map<string, string>();
const thumbnailDataUrlCache = new Map<string, string>();

function getOrCreateObjectUrl(mediaKey: string, blob: Blob): string {
  const existing = blobObjectUrls.get(mediaKey);
  if (existing) return existing;
  const created = URL.createObjectURL(blob);
  blobObjectUrls.set(mediaKey, created);
  return created;
}

const canvasRenderState = new WeakMap<
  HTMLCanvasElement,
  { seq: number; cancelCurrent?: () => void }
>();

function beginCanvasRenderSlot(canvas: HTMLCanvasElement): {
  seq: number;
  isLatest: () => boolean;
  registerCancel: (fn: () => void) => void;
} {
  const prev = canvasRenderState.get(canvas);
  if (prev?.cancelCurrent) {
    try {
      prev.cancelCurrent();
    } catch {
      // Ignore cancellation error
    }
  }
  const nextSeq = (prev?.seq ?? 0) + 1;
  const entry: { seq: number; cancelCurrent?: () => void } = { seq: nextSeq };
  canvasRenderState.set(canvas, entry);

  return {
    seq: nextSeq,
    isLatest: () => canvasRenderState.get(canvas)?.seq === nextSeq,
    registerCancel: (fn: () => void) => {
      if (canvasRenderState.get(canvas)?.seq === nextSeq) {
        entry.cancelCurrent = fn;
      }
    },
  };
}

async function getPdfDocumentFromBlobKey(
  mediaKey: string
): Promise<pdfjsLib.PDFDocumentProxy> {
  const cached = loadedBlobPdfDocs.get(mediaKey);
  if (cached) return cached;

  const blobData = await getMediaBlob(mediaKey);
  if (!blobData) {
    throw new Error('PDF binary missing in local classroom vault.');
  }

  let blobObj: Blob;
  if (blobData instanceof Blob) {
    blobObj = blobData;
  } else if (blobData instanceof ArrayBuffer) {
    blobObj = new Blob([blobData], { type: 'application/pdf' });
  } else {
    throw new Error('Unsupported PDF storage format.');
  }

  const objectUrl = getOrCreateObjectUrl(mediaKey, blobObj);
  const loadingTask = pdfjsLib.getDocument({
    url: objectUrl,
    disableAutoFetch: true,
    disableStream: false,
  });
  const doc = await loadingTask.promise;
  loadedBlobPdfDocs.set(mediaKey, doc);
  return doc;
}

export function getPdfDocumentFromStaticUrl(
  pdfUrl: string
): Promise<pdfjsLib.PDFDocumentProxy> {
  const existing = loadedUrlPdfDocs.get(pdfUrl);
  if (existing) return existing;

  const promise = pdfjsLib
    .getDocument({
      url: pdfUrl,
      disableAutoFetch: true,
      disableStream: false,
    })
    .promise.catch((err) => {
      loadedUrlPdfDocs.delete(pdfUrl);
      throw err;
    });
  loadedUrlPdfDocs.set(pdfUrl, promise);
  return promise;
}

/**
 * Zero-copy fast PDF page counter: streams header/xref via Blob Object URL (<80ms even for 50MB PDFs)
 * and keeps the PDFDocumentProxy cached for instant thumbnail & live slide rendering.
 */
export async function inspectAndCachePdfBlob(
  mediaKey: string,
  blob: Blob
): Promise<number> {
  const objectUrl = getOrCreateObjectUrl(mediaKey, blob);
  const loadingTask = pdfjsLib.getDocument({
    url: objectUrl,
    disableAutoFetch: true,
    disableStream: false,
  });
  const doc = await loadingTask.promise;
  loadedBlobPdfDocs.set(mediaKey, doc);
  return doc.numPages;
}

async function resolveImageSrcFromMediaKey(mediaKey: string): Promise<string | null> {
  const stored = await getMediaBlob(mediaKey);
  if (!stored) return null;
  if (typeof stored === 'string') return stored;
  if (stored instanceof Blob) return getOrCreateObjectUrl(mediaKey, stored);
  if (stored instanceof ArrayBuffer) {
    return getOrCreateObjectUrl(mediaKey, new Blob([stored]));
  }
  return null;
}

function drawCachedDataUrlToCanvas(
  canvas: HTMLCanvasElement,
  dataUrl: string,
  isLatest: () => boolean
): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (!isLatest()) {
        resolve();
        return;
      }
      canvas.width = Math.max(1, img.width);
      canvas.height = Math.max(1, img.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
      }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = dataUrl;
  });
}

export async function renderSlideThumbnailToCanvas(
  canvas: HTMLCanvasElement,
  slide: SlideDescriptor,
  targetWidth = 380
): Promise<void> {
  const slot = beginCanvasRenderSlot(canvas);

  if (
    (slide.sourceType === SlideSourceType.STATIC_PDF_URL &&
      slide.pdfUrl &&
      slide.pdfPageNumber) ||
    (slide.sourceType === SlideSourceType.PDF_PAGE &&
      slide.mediaKey &&
      slide.pdfPageNumber)
  ) {
    const cacheKey = `${slide.pdfUrl || slide.mediaKey}_p${slide.pdfPageNumber}_w${targetWidth}`;
    const cachedUrl = thumbnailDataUrlCache.get(cacheKey);
    if (cachedUrl) {
      await drawCachedDataUrlToCanvas(canvas, cachedUrl, slot.isLatest);
      return;
    }

    const pdfDoc =
      slide.sourceType === SlideSourceType.STATIC_PDF_URL
        ? await getPdfDocumentFromStaticUrl(slide.pdfUrl!)
        : await getPdfDocumentFromBlobKey(slide.mediaKey!);

    if (!slot.isLatest()) return;

    const page = await pdfDoc.getPage(slide.pdfPageNumber!);
    if (!slot.isLatest()) {
      page.cleanup();
      return;
    }

    const baseVp = page.getViewport({ scale: 1 });
    const scale = Math.min(1.5, targetWidth / Math.max(1, baseVp.width));
    const vp = page.getViewport({ scale });

    const offscreen = document.createElement('canvas');
    offscreen.width = Math.max(1, Math.floor(vp.width));
    offscreen.height = Math.max(1, Math.floor(vp.height));
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) {
      page.cleanup();
      return;
    }

    offCtx.fillStyle = '#2B2B2E';
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

    const renderTask = page.render({
      canvasContext: offCtx,
      canvas: offscreen,
      viewport: vp,
    });
    slot.registerCancel(() => renderTask.cancel());

    try {
      await renderTask.promise;
      if (slot.isLatest()) {
        canvas.width = offscreen.width;
        canvas.height = offscreen.height;
        const dstCtx = canvas.getContext('2d');
        dstCtx?.drawImage(offscreen, 0, 0);

        try {
          if (thumbnailDataUrlCache.size < 40) {
            thumbnailDataUrlCache.set(
              cacheKey,
              offscreen.toDataURL('image/jpeg', 0.8)
            );
          }
        } catch {
          // Ignore dataURL cache failure
        }
      }
    } catch (err) {
      const errName = (err as { name?: string })?.name;
      if (errName !== 'RenderingCancelledException') {
        throw err;
      }
    } finally {
      offscreen.width = 0;
      offscreen.height = 0;
      page.cleanup();
    }
    return;
  }

  if (slide.sourceType === SlideSourceType.IMAGE_DATA && slide.mediaKey) {
    const imgSrc = await resolveImageSrcFromMediaKey(slide.mediaKey);
    if (imgSrc && slot.isLatest()) {
      await drawCachedDataUrlToCanvas(canvas, imgSrc, slot.isLatest);
    }
    return;
  }

  if (slide.sourceType === SlideSourceType.DEMO_BOARD && slide.demoSpec) {
    renderDemoBoardToCanvas(
      canvas,
      slide.demoSpec,
      slide.index + 1,
      6,
      BroadcastOrientation.LANDSCAPE,
      0.5
    );
  }
}

export async function renderSlideToCanvas(
  canvas: HTMLCanvasElement,
  slide: SlideDescriptor,
  totalSlides: number,
  orientation: BroadcastOrientation,
  zoom: number,
  containerWidth: number,
  containerHeight: number,
  extraRotationDeg = 0
): Promise<void> {
  const slot = beginCanvasRenderSlot(canvas);
  const normRot = ((extraRotationDeg % 360) + 360) % 360;

  if (slide.sourceType === SlideSourceType.DEMO_BOARD && slide.demoSpec) {
    const temp = document.createElement('canvas');
    renderDemoBoardToCanvas(
      temp,
      slide.demoSpec,
      slide.index + 1,
      totalSlides,
      orientation,
      zoom
    );
    if (normRot === 0) {
      canvas.width = temp.width;
      canvas.height = temp.height;
      canvas.getContext('2d')?.drawImage(temp, 0, 0);
    } else {
      const swap = normRot === 90 || normRot === 270;
      canvas.width = swap ? temp.height : temp.width;
      canvas.height = swap ? temp.width : temp.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((normRot * Math.PI) / 180);
        ctx.drawImage(temp, -temp.width / 2, -temp.height / 2);
        ctx.restore();
      }
    }
    temp.width = 0;
    temp.height = 0;
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);

  if (
    (slide.sourceType === SlideSourceType.PDF_PAGE &&
      slide.mediaKey &&
      slide.pdfPageNumber) ||
    (slide.sourceType === SlideSourceType.STATIC_PDF_URL &&
      slide.pdfUrl &&
      slide.pdfPageNumber)
  ) {
    const pdfDoc =
      slide.sourceType === SlideSourceType.STATIC_PDF_URL
        ? await getPdfDocumentFromStaticUrl(slide.pdfUrl!)
        : await getPdfDocumentFromBlobKey(slide.mediaKey!);

    if (!slot.isLatest()) return;

    const page = await pdfDoc.getPage(slide.pdfPageNumber!);
    if (!slot.isLatest()) {
      page.cleanup();
      return;
    }

    const rotationDeg = (page.rotate + normRot) % 360;
    const unscaledViewport = page.getViewport({
      scale: 1,
      rotation: rotationDeg,
    });

    const safeW = Math.max(containerWidth, 280);
    const safeH = Math.max(containerHeight, 280);

    const scaleX = safeW / Math.max(1, unscaledViewport.width);
    const scaleY = safeH / Math.max(1, unscaledViewport.height);
    // Render crisp enough for either fit or full-width fill
    const baseFit = Math.max(Math.min(scaleX, scaleY), Math.min(scaleX, scaleY * 1.25));
    const desiredPixelScale = baseFit * zoom * dpr;

    const maxScaleByCap = Math.min(
      MAX_CANVAS_PX / Math.max(1, unscaledViewport.width),
      MAX_CANVAS_PX / Math.max(1, unscaledViewport.height)
    );
    const finalScale = Math.max(0.25, Math.min(desiredPixelScale, maxScaleByCap));

    const renderViewport = page.getViewport({
      scale: finalScale,
      rotation: rotationDeg,
    });

    const offscreen = document.createElement('canvas');
    offscreen.width = Math.max(1, Math.floor(renderViewport.width));
    offscreen.height = Math.max(1, Math.floor(renderViewport.height));

    const offCtx = offscreen.getContext('2d');
    if (!offCtx) {
      page.cleanup();
      return;
    }

    offCtx.fillStyle = '#2B2B2E';
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

    const renderTask = page.render({
      canvasContext: offCtx,
      canvas: offscreen,
      viewport: renderViewport,
    });
    slot.registerCancel(() => renderTask.cancel());

    try {
      await renderTask.promise;
      if (slot.isLatest()) {
        canvas.width = offscreen.width;
        canvas.height = offscreen.height;
        const dstCtx = canvas.getContext('2d');
        if (dstCtx) {
          dstCtx.drawImage(offscreen, 0, 0);
        }
      }
    } catch (err) {
      const errName = (err as { name?: string })?.name;
      if (errName !== 'RenderingCancelledException') {
        throw err;
      }
    } finally {
      offscreen.width = 0;
      offscreen.height = 0;
      page.cleanup();
    }
    return;
  }

  if (slide.sourceType === SlideSourceType.IMAGE_DATA && slide.mediaKey) {
    const imgSrc = await resolveImageSrcFromMediaKey(slide.mediaKey);
    if (!imgSrc || !slot.isLatest()) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (!slot.isLatest()) {
          resolve();
          return;
        }
        const safeW = Math.max(containerWidth, 280);
        const safeH = Math.max(containerHeight, 280);
        const swap = normRot === 90 || normRot === 270;
        const effW = Math.max(1, swap ? img.height : img.width);
        const effH = Math.max(1, swap ? img.width : img.height);
        const desiredScale = Math.min(safeW / effW, safeH / effH) * zoom * dpr;
        const cappedScale = Math.min(
          desiredScale,
          MAX_CANVAS_PX / effW,
          MAX_CANVAS_PX / effH
        );

        canvas.width = Math.max(1, Math.floor(effW * cappedScale));
        canvas.height = Math.max(1, Math.floor(effH * cappedScale));

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#2B2B2E';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((normRot * Math.PI) / 180);
          const drawW = swap ? canvas.height : canvas.width;
          const drawH = swap ? canvas.width : canvas.height;
          ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();
        }
        resolve();
      };
      img.onerror = () => reject(new Error('Failed to decode slide image'));
      img.src = imgSrc;
    });
  }
}
