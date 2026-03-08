/**
 * E2E Tests — App UI
 *
 * Validates that the application loads correctly and all UI elements
 * are visible and interactive in a real browser.
 */
import { test, expect } from '@playwright/test';

test.describe('App UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ── Page Load ─────────────────────────────────────────────
  test('should load the page with the correct title', async ({ page }) => {
    // Vite dev server sets the title from index.html
    await expect(page).toHaveTitle(/frontend-react|Emotional Chronicler/i);
  });

  // ── Title Badge ───────────────────────────────────────────
  test('should display the app title "The Emotional Chronicler"', async ({ page }) => {
    const title = page.locator('h1');
    await expect(title).toHaveText('The Emotional Chronicler');
    await expect(title).toBeVisible();
  });

  test('should display the subtitle "Immersive AI Storytelling"', async ({ page }) => {
    const subtitle = page.locator('.app-subtitle');
    await expect(subtitle).toHaveText('Immersive AI Storytelling');
    await expect(subtitle).toBeVisible();
  });

  test('should display the gem icon ✦', async ({ page }) => {
    const gem = page.locator('.title-badge__gem');
    await expect(gem).toHaveText('✦');
    await expect(gem).toBeVisible();
  });

  // ── Connection Status Dot ─────────────────────────────────
  test('should show "DISCONNECTED" status initially', async ({ page }) => {
    const statusDot = page.locator('.conn-dot__label');
    await expect(statusDot).toHaveText('DISCONNECTED');
  });

  test('should have the disconnected CSS class on the status dot', async ({ page }) => {
    const dot = page.locator('.conn-dot');
    await expect(dot).toHaveClass(/conn-dot--disconnected/);
  });

  // ── Talk to Elora Button ──────────────────────────────────
  test('should display the "Talk to Elora" button', async ({ page }) => {
    const button = page.locator('.hud-btn');
    await expect(button).toBeVisible();
    await expect(button).toContainText('Talk to Elora');
  });

  test('the button should be enabled and clickable', async ({ page }) => {
    const button = page.locator('.hud-btn');
    await expect(button).toBeEnabled();
  });

  test('the button should have the idle styling', async ({ page }) => {
    const button = page.locator('.hud-btn');
    await expect(button).toHaveClass(/hud-btn--idle/);
  });

  // ── Emotion Controls ──────────────────────────────────────
  test('should display all 4 emotion buttons', async ({ page }) => {
    const emoContainer = page.locator('.dev-emotions');
    await expect(emoContainer).toBeVisible();

    const buttons = emoContainer.locator('.emo-btn');
    await expect(buttons).toHaveCount(4);
  });

  test('should display correct emoji in each emotion button', async ({ page }) => {
    const emoContainer = page.locator('.dev-emotions');

    await expect(emoContainer.locator('.emo-btn').nth(0)).toContainText('😐');
    await expect(emoContainer.locator('.emo-btn').nth(1)).toContainText('😊');
    await expect(emoContainer.locator('.emo-btn').nth(2)).toContainText('😢');
    await expect(emoContainer.locator('.emo-btn').nth(3)).toContainText('😲');
  });

  test('neutral emotion should be active by default', async ({ page }) => {
    const neutralBtn = page.locator('.dev-emotions .emo-btn').first();
    await expect(neutralBtn).toHaveClass(/emo-btn--active/);
  });

  test('clicking an emotion button should activate it', async ({ page }) => {
    const happyBtn = page.locator('.dev-emotions .emo-btn').nth(1);
    await happyBtn.click();
    await expect(happyBtn).toHaveClass(/emo-btn--active/);

    // Neutral should no longer be active
    const neutralBtn = page.locator('.dev-emotions .emo-btn').first();
    await expect(neutralBtn).not.toHaveClass(/emo-btn--active/);
  });

  // ── Layout Structure ──────────────────────────────────────
  test('should have the app root with correct structure', async ({ page }) => {
    await expect(page.locator('.app-root')).toBeVisible();
    await expect(page.locator('.app-header')).toBeVisible();
    await expect(page.locator('.title-badge')).toBeVisible();
    await expect(page.locator('.conn-dot')).toBeVisible();
    await expect(page.locator('.avatar-hud')).toBeVisible();
    await expect(page.locator('.dev-emotions')).toBeVisible();
  });

  // ── Design System ─────────────────────────────────────────
  test('should load custom fonts (Cinzel for title)', async ({ page }) => {
    const title = page.locator('h1.app-title');
    const fontFamily = await title.evaluate(el => getComputedStyle(el).fontFamily);
    expect(fontFamily).toContain('Cinzel');
  });

  test('should have dark background on the app root', async ({ page }) => {
    const bgColor = await page.locator('.app-root').evaluate(el => {
      return getComputedStyle(el).background;
    });
    // The app root has a radial-gradient background
    expect(bgColor).toContain('radial-gradient');
  });
});
