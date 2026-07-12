/**
 * Per-frame DOM snapshotting for video export. Turns the export DOM node into an
 * HTMLCanvasElement at a fixed pixelRatio using the same dom-export path and
 * font-embedding options as the image exporter, so video frames match PNG output.
 */

import type {HtmlExportOptions} from '@codeimage/dom-export';
import {EXPORT_EXCLUDE} from '@core/directives/exportExclude';
import {centerOffset, type CaptureSize} from './videoExportMath';

function loadDomExport() {
  return import('@codeimage/dom-export');
}

/**
 * Build the dom-export options for a video frame. Mirrors use-export-image's
 * filter (respecting data-export-exclude + the EXPORT_EXCLUDE symbol) and font
 * embedding.
 *
 * IMPORTANT: we do NOT force canvasWidth/canvasHeight here. dom-export renders
 * the node to an SVG at its natural size, then `drawImage`s that SVG STRETCHED to
 * fill canvasWidth×canvasHeight (packages/dom-export/src/lib/index.ts) — it does
 * not letterbox or top-left place. Forcing a fixed canvas size therefore distorts
 * any slide whose natural size differs from the target. Instead every frame is
 * captured at its own natural size and the export loop composites it centered
 * onto a fixed-size backing canvas, which keeps aspect ratios exact and stable.
 */
export function frameExportOptions(pixelRatio: number): HtmlExportOptions {
  return {
    type: 'image/png',
    filter: (node: Node | undefined) => {
      const el = node as Element | null;
      const attr = el?.getAttribute?.('data-export-exclude');
      const isNotExcluded = !attr || attr === 'false';
      const notSymbolExcluded =
        !node?.hasOwnProperty(EXPORT_EXCLUDE) ||
        !(node as Node & {[EXPORT_EXCLUDE]: boolean})[EXPORT_EXCLUDE];
      return isNotExcluded && notSymbolExcluded;
    },
    pixelRatio,
    experimental_optimizeFontLoading: true,
    experimental_includeExternalFonts: ['inter var'],
  };
}

export type CaptureNode = (
  node: HTMLElement,
  options: HtmlExportOptions,
) => Promise<HTMLCanvasElement>;

/**
 * Resolve dom-export's `toCanvas` once so the capture loop doesn't re-import per
 * frame. Returned function snapshots `node` to a canvas at the given options.
 */
export async function createFrameCapturer(): Promise<CaptureNode> {
  const {toCanvas} = await loadDomExport();
  return (node, options) => toCanvas(node, options);
}

/**
 * Composite a naturally-sized capture centered onto a fresh fixed-size backing
 * canvas. The backing canvas is the locked export size (same for every frame, so
 * H.264 stays valid); `source` is a single slide's capture at its own natural
 * size, which is <= the backing size on both axes.
 *
 * The margin around a smaller slide is filled with `backgroundColor` — the
 * slide's own frame background — so the extra space reads as frame padding rather
 * than a hard letterbox. MP4 has no alpha, so a color (never transparent) is used.
 *
 * A reusable backing canvas + context are passed in so the loop allocates once.
 */
export function compositeCentered(
  backing: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  size: CaptureSize,
  source: HTMLCanvasElement,
  backgroundColor: string,
): HTMLCanvasElement {
  if (backing.width !== size.width) backing.width = size.width;
  if (backing.height !== size.height) backing.height = size.height;

  context.clearRect(0, 0, size.width, size.height);
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, size.width, size.height);

  const {x, y} = centerOffset(size, {
    width: source.width,
    height: source.height,
  });
  context.drawImage(source, x, y);
  return backing;
}
