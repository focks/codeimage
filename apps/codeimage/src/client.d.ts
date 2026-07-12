/// <reference types="vite/client" />

declare module 'gifenc' {
  export function GIFEncoder(opts?: {
    initialCapacity?: number;
    auto?: boolean;
  }): {
    reset(): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    readonly buffer: ArrayBuffer;
    writeHeader(): void;
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: {
        transparent?: boolean;
        transparentIndex?: number;
        delay?: number;
        palette?: number[][];
        repeat?: number;
        colorDepth?: number;
        dispose?: number;
        first?: boolean;
      },
    ): void;
  };

  export function quantize(
    rgba: Uint8ClampedArray,
    maxColors: number,
    opts?: {format?: string; oneBitAlpha?: boolean},
  ): number[][];

  export function applyPalette(
    rgba: Uint8ClampedArray,
    palette: number[][],
    format?: string,
  ): Uint8Array;
}

interface ImportMetaEnv {
  readonly VITE_PUBLIC_AUTH0_DOMAIN: string;
  readonly VITE_PUBLIC_AUTH0_CLIENT_ID: string;
  readonly VITE_PUBLIC_MY_CALLBACK_URL: string;
  readonly VITE_PUBLIC_AUTH0_AUDIENCE: string;
  readonly VITE_ENABLE_MSW: boolean;
  readonly VITE_MOCK_AUTH: boolean;
  readonly VITE_API_BASE_URL: string | null;
  readonly VITE_PRESET_LIMIT: number;
  readonly VITE_PRESET_LIMIT_GUEST: number;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
