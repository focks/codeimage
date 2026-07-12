/**
 * Per-frame DOM snapshotting for video export. Turns the export DOM node into an
 * HTMLCanvasElement at a fixed pixelRatio using the same dom-export path and
 * font-embedding options as the image exporter, so video frames match PNG output.
 */

import type {HtmlExportOptions} from '@codeimage/dom-export';
import {EXPORT_EXCLUDE} from '@core/directives/exportExclude';

function loadDomExport() {
  return import('@codeimage/dom-export');
}

/**
 * Build the dom-export options for a video frame. Mirrors use-export-image's
 * filter (respecting data-export-exclude + the EXPORT_EXCLUDE symbol) and font
 * embedding, forcing exact canvas dimensions so every frame is the same size.
 */
export function frameExportOptions(
  width: number,
  height: number,
  pixelRatio: number,
): HtmlExportOptions {
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
    // Force identical output pixels for every frame — H.264 needs stable dims.
    canvasWidth: width / pixelRatio,
    canvasHeight: height / pixelRatio,
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
