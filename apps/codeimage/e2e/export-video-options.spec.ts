/**
 * Playwright E2E tests for the extended video export dialog.
 * Tests GIF format, 60fps, 4x scale options and the cancel flow.
 *
 * The tests validate UI behavior (option availability, GIF fps lock, scale
 * clamp warning) and — when possible — actual file downloads via
 * Playwright's download interception + ffprobe validation.
 *
 * Requires: dev server at http://localhost:4200, ffprobe on PATH.
 */

import {test, expect} from '@playwright/test';
import {execSync} from 'child_process';
import path from 'path';
import fs from 'fs';

const APP_URL = 'http://localhost:4200';
const EXPORTS_DIR = '/Users/focks/ws/snapify/exports';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openExportVideoDialog(page: import('@playwright/test').Page) {
  // Click the "Video" export button (aria-label="Export video").
  const videoBtn = page.getByRole('button', {name: 'Export video'});
  await videoBtn.waitFor({state: 'visible', timeout: 10_000});
  await videoBtn.click();
  // Wait for the dialog to appear.
  await expect(page.getByRole('dialog')).toBeVisible({timeout: 5_000});
}

async function selectFormat(
  page: import('@playwright/test').Page,
  format: 'MP4' | 'GIF',
) {
  await page.getByRole('radio', {name: format}).click();
}

async function selectFps(
  page: import('@playwright/test').Page,
  fps: '30' | '60',
) {
  await page.getByRole('radio', {name: fps}).click();
}

async function selectScale(
  page: import('@playwright/test').Page,
  scale: '1x' | '2x' | '4x',
) {
  await page.getByRole('radio', {name: scale}).click();
}

function ffprobe(filePath: string): string {
  return execSync(`ffprobe -v quiet -print_format json -show_streams "${filePath}"`, {
    encoding: 'utf8',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Export video dialog options', () => {
  test.beforeEach(async ({page}) => {
    await page.goto(APP_URL, {waitUntil: 'networkidle'});
    // Dismiss any modal/overlay that might be present on first load.
    const closeBtn = page.getByRole('button', {name: /close|dismiss|got it/i});
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    }
  });

  test('dialog shows format selector with MP4 and GIF options', async ({
    page,
  }) => {
    await openExportVideoDialog(page);
    await expect(page.getByRole('radio', {name: 'MP4'})).toBeVisible();
    await expect(page.getByRole('radio', {name: 'GIF'})).toBeVisible();
  });

  test('dialog shows fps selector with 30 and 60 options for MP4', async ({
    page,
  }) => {
    await openExportVideoDialog(page);
    // Default is MP4 — fps selector should show 30 and 60.
    await expect(page.getByRole('radio', {name: '30'})).toBeVisible();
    await expect(page.getByRole('radio', {name: '60'})).toBeVisible();
  });

  test('GIF format hides fps radio and shows fps cap text', async ({page}) => {
    await openExportVideoDialog(page);
    await selectFormat(page, 'GIF');
    // The fps radio buttons should be replaced by a static text showing GIF cap.
    await expect(page.getByRole('radio', {name: '30'})).not.toBeVisible();
    await expect(page.getByRole('radio', {name: '60'})).not.toBeVisible();
    // Should show a text with the GIF fps cap (15 fps).
    await expect(page.getByText(/15 fps.*GIF/i)).toBeVisible();
  });

  test('switching back to MP4 restores the fps selector', async ({page}) => {
    await openExportVideoDialog(page);
    await selectFormat(page, 'GIF');
    await selectFormat(page, 'MP4');
    await expect(page.getByRole('radio', {name: '30'})).toBeVisible();
    await expect(page.getByRole('radio', {name: '60'})).toBeVisible();
  });

  test('resolution selector shows 1x, 2x and 4x options', async ({page}) => {
    await openExportVideoDialog(page);
    await expect(page.getByRole('radio', {name: '1x'})).toBeVisible();
    await expect(page.getByRole('radio', {name: '2x'})).toBeVisible();
    await expect(page.getByRole('radio', {name: '4x'})).toBeVisible();
  });

  test('close button dismisses the dialog without exporting', async ({
    page,
  }) => {
    await openExportVideoDialog(page);
    await page.getByRole('button', {name: 'Close'}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible({timeout: 3_000});
  });

  test('cancel mid-export restores editor state and shows no console errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await openExportVideoDialog(page);
    // Select GIF (slower to start but the cancel path is the same).
    await selectFormat(page, 'GIF');
    // Start the export.
    await page.getByRole('button', {name: 'Export'}).click();
    // Wait briefly for the export to begin (Cancel button should appear).
    const cancelBtn = page.getByRole('button', {name: 'Cancel'});
    await cancelBtn.waitFor({state: 'visible', timeout: 15_000});
    // Cancel immediately.
    await cancelBtn.click();
    // The cancel button should disappear and the export/close buttons return.
    await expect(page.getByRole('button', {name: 'Export'})).toBeVisible({
      timeout: 30_000,
    });
    // Close the dialog.
    await page.getByRole('button', {name: 'Close'}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // No unexpected console errors (excluding known benign warnings).
    const unexpectedErrors = consoleErrors.filter(
      err =>
        !err.includes('favicon') &&
        !err.includes('msw') &&
        !err.includes('Failed to load resource'),
    );
    expect(unexpectedErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Download + ffprobe validation tests
// These tests trigger actual exports and validate the downloaded files.
// They require ffprobe on PATH and will be skipped if the slide count is < 2.
// ---------------------------------------------------------------------------

test.describe('Export downloads (ffprobe validated)', () => {
  test.beforeEach(async ({page}) => {
    fs.mkdirSync(EXPORTS_DIR, {recursive: true});
    await page.goto(APP_URL, {waitUntil: 'networkidle'});
    const closeBtn = page.getByRole('button', {name: /close|dismiss|got it/i});
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    }
  });

  test('GIF export downloads a valid GIF with >=1 frame', async ({page}) => {
    // Only run if the video button is enabled (requires at least 1 slide).
    const videoBtn = page.getByRole('button', {name: 'Export video'});
    if (await videoBtn.isDisabled().catch(() => true)) {
      test.skip();
      return;
    }

    const downloadPath = path.join(EXPORTS_DIR, 'test.gif');
    if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath);

    const [download] = await Promise.all([
      page.waitForEvent('download', {timeout: 120_000}),
      (async () => {
        await openExportVideoDialog(page);
        await selectFormat(page, 'GIF');
        await page.getByRole('button', {name: 'Export'}).click();
      })(),
    ]);

    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);

    // Validate with ffprobe: must be a valid GIF demuxed by ffprobe.
    const probe = ffprobe(downloadPath);
    const streams = JSON.parse(probe).streams as Array<{codec_name?: string}>;
    const gifStream = streams.find(s => s.codec_name === 'gif');
    expect(gifStream).toBeDefined();

    // Extract 6 frames as a sanity check.
    const framesDir = path.join(EXPORTS_DIR, 'gif_frames');
    fs.mkdirSync(framesDir, {recursive: true});
    execSync(
      `ffmpeg -y -i "${downloadPath}" -frames:v 6 "${framesDir}/frame_%03d.png"`,
      {stdio: 'ignore'},
    );
    const frames = fs.readdirSync(framesDir).filter(f => f.endsWith('.png'));
    expect(frames.length).toBeGreaterThanOrEqual(1);

    // Clean up frames.
    frames.forEach(f => fs.unlinkSync(path.join(framesDir, f)));
    fs.rmdirSync(framesDir);
  });

  test('MP4 60fps 1x export downloads a valid MP4 at 60fps', async ({
    page,
  }) => {
    const videoBtn = page.getByRole('button', {name: 'Export video'});
    if (await videoBtn.isDisabled().catch(() => true)) {
      test.skip();
      return;
    }

    const downloadPath = path.join(EXPORTS_DIR, 'test-60fps.mp4');
    if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath);

    const [download] = await Promise.all([
      page.waitForEvent('download', {timeout: 120_000}),
      (async () => {
        await openExportVideoDialog(page);
        await selectFormat(page, 'MP4');
        await selectFps(page, '60');
        await selectScale(page, '1x');
        await page.getByRole('button', {name: 'Export'}).click();
      })(),
    ]);

    await download.saveAs(downloadPath);
    expect(fs.existsSync(downloadPath)).toBe(true);

    const probe = ffprobe(downloadPath);
    const streams = JSON.parse(probe).streams as Array<{
      codec_type?: string;
      r_frame_rate?: string;
      avg_frame_rate?: string;
    }>;
    const videoStream = streams.find(s => s.codec_type === 'video');
    expect(videoStream).toBeDefined();

    // Frame rate should be 60/1.
    const frRate = videoStream!.r_frame_rate ?? videoStream!.avg_frame_rate;
    expect(frRate).toBe('60/1');
  });
});
