import {describe, expect, it} from 'vitest';
import {diffLines, splitLines} from './lineDiff';

describe('splitLines', () => {
  it('splits on newlines', () => {
    expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });
  it('drops a single trailing-newline empty tail', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
  });
  it('keeps intentional interior blank lines', () => {
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b']);
  });
  it('empty string => no lines', () => {
    expect(splitLines('')).toEqual([]);
  });
});

describe('diffLines', () => {
  it('all-common when identical', () => {
    const d = diffLines('a\nb\nc', 'a\nb\nc');
    expect(d.map(e => e.kind)).toEqual(['common', 'common', 'common']);
    expect(d.every(e => e.prevIndex === e.nextIndex)).toBe(true);
  });

  it('detects an added line in the middle', () => {
    const d = diffLines('a\nc', 'a\nb\nc');
    expect(d.map(e => [e.kind, e.content])).toEqual([
      ['common', 'a'],
      ['added', 'b'],
      ['common', 'c'],
    ]);
    // 'c' keeps its indices in both prev(1) and next(2).
    const cLine = d.find(e => e.content === 'c')!;
    expect(cLine).toMatchObject({prevIndex: 1, nextIndex: 2});
  });

  it('detects a removed line', () => {
    const d = diffLines('a\nb\nc', 'a\nc');
    expect(d.map(e => [e.kind, e.content])).toEqual([
      ['common', 'a'],
      ['removed', 'b'],
      ['common', 'c'],
    ]);
    const removed = d.find(e => e.kind === 'removed')!;
    expect(removed).toMatchObject({content: 'b', prevIndex: 1, nextIndex: -1});
  });

  it('handles a full replacement (everything removed then added)', () => {
    const d = diffLines('x\ny', 'p\nq');
    expect(d.filter(e => e.kind === 'removed').map(e => e.content)).toEqual([
      'x',
      'y',
    ]);
    expect(d.filter(e => e.kind === 'added').map(e => e.content)).toEqual([
      'p',
      'q',
    ]);
  });

  it('empty prev => all added (slide-0 style entry from empty)', () => {
    const d = diffLines('', 'a\nb');
    expect(d.map(e => [e.kind, e.content])).toEqual([
      ['added', 'a'],
      ['added', 'b'],
    ]);
  });

  it('empty next => all removed', () => {
    const d = diffLines('a\nb', '');
    expect(d.every(e => e.kind === 'removed')).toBe(true);
  });

  it('is deterministic', () => {
    const prev = 'const a = 1\nconst b = 2\nreturn a';
    const next = 'const a = 1\nconst c = 3\nconst b = 2\nreturn a + c';
    expect(diffLines(prev, next)).toEqual(diffLines(prev, next));
  });
});
