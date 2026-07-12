/**
 * Pure line-level diff used by the `slide` entry animation.
 *
 * The renderer needs to know, for a transition from `prev` code to `next` code,
 * which lines are unchanged (stay put), which are removed (slide out left) and
 * which are added (slide in from the right). A classic LCS over whole lines is
 * more than enough — code screencasts diff a handful of lines, not megabytes —
 * and being a pure function keeps the transition fully seekable for export.
 */

export type LineDiffKind = 'common' | 'added' | 'removed';

export interface LineDiffEntry {
  readonly kind: LineDiffKind;
  /** The line's text (without its trailing newline). */
  readonly content: string;
  /** Index of this line in `prev` (for `common`/`removed`), else -1. */
  readonly prevIndex: number;
  /** Index of this line in `next` (for `common`/`added`), else -1. */
  readonly nextIndex: number;
}

/** Split code into lines, dropping a single trailing newline's empty tail. */
export function splitLines(code: string): string[] {
  if (code.length === 0) return [];
  const lines = code.split('\n');
  // A trailing newline yields a spurious empty final element; drop it so the
  // diff doesn't treat "file ends with \n" as an extra blank line.
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/**
 * Longest-common-subsequence line diff between two code strings. Returns entries
 * in output order: common + added lines follow `next`'s ordering, and each
 * removed line is emitted just before the common line that follows it in `prev`
 * (so removed lines appear at their original position). Deterministic.
 */
export function diffLines(prev: string, next: string): LineDiffEntry[] {
  const a = splitLines(prev);
  const b = splitLines(next);
  const lcs = lcsMatrix(a, b);

  const entries: LineDiffEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      entries.push({kind: 'common', content: a[i], prevIndex: i, nextIndex: j});
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      entries.push({kind: 'removed', content: a[i], prevIndex: i, nextIndex: -1});
      i++;
    } else {
      entries.push({kind: 'added', content: b[j], prevIndex: -1, nextIndex: j});
      j++;
    }
  }
  while (i < a.length) {
    entries.push({kind: 'removed', content: a[i], prevIndex: i, nextIndex: -1});
    i++;
  }
  while (j < b.length) {
    entries.push({kind: 'added', content: b[j], prevIndex: -1, nextIndex: j});
    j++;
  }
  return entries;
}

/**
 * Build the LCS length matrix `lcs[i][j]` = LCS length of `a[i..]` and `b[j..]`.
 * `(a.length+1) x (b.length+1)`, zero-filled at the far edges. O(n·m) time/space,
 * fine for the small line counts in a code slide.
 */
function lcsMatrix(a: readonly string[], b: readonly string[]): number[][] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const lcs: number[][] = Array.from({length: rows}, () =>
    new Array<number>(cols).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  return lcs;
}
