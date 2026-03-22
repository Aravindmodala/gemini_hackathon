/**
 * E2E Tests — App UI
 *
 * Validates that the application loads correctly and all UI elements
 * are visible and interactive in a real browser.
 *
 * Note: Since the app now requires Firebase auth, the e2e tests
 * focus on the auth screen (which is shown by default) and
 * structural elements that are visible without authentication.
 */
import { test, expect } from '@playwright/test';

test.describe('Auth Screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ── Page Load ─────────────────────────────────────────────
  test('should load the page with the correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/frontend-react|Emotional Chronicler/i);
  });

  // ── Auth Screen is shown on load ──────────────────────────
  test('should show auth screen on initial load', async ({ page }) => {
    // The auth screen shows "The Emotional Chronicler" title
    const title = page.locator('h1');
    await expect(title).toBeVisible({ timeout: 10000 });
  });

  test('should display the tagline "Where your emotions shape the story"', async ({ page }) => {
    const tagline = page.getByText('Where your emotions shape the story');
    await expect(tagline).toBeVisible({ timeout: 10000 });
  });

  // ── Sign In Form ──────────────────────────────────────────
  test('should display email and password inputs', async ({ page }) => {
    const emailInput = page.getByPlaceholder('Email address');
    const passwordInput = page.getByPlaceholder('Password');

    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await expect(passwordInput).toBeVisible();
  });

  test('should display Sign In button', async ({ page }) => {
    const signInBtn = page.getByRole('button', { name: /sign in/i });
    await expect(signInBtn).toBeVisible({ timeout: 10000 });
  });

  test('should display Google sign-in button', async ({ page }) => {
    const googleBtn = page.getByRole('button', { name: /continue with google/i });
    await expect(googleBtn).toBeVisible({ timeout: 10000 });
  });

  // ── Tab Switching ─────────────────────────────────────────
  test('should switch to Sign Up form when Sign Up tab is clicked', async ({ page }) => {
    const signUpTab = page.getByRole('button', { name: 'Sign Up' });
    await expect(signUpTab).toBeVisible({ timeout: 10000 });
    await signUpTab.click();

    // Sign Up form should show name, email, password, confirm password
    await expect(page.getByPlaceholder('Your name')).toBeVisible();
    await expect(page.getByPlaceholder('Email address')).toBeVisible();
    await expect(page.getByPlaceholder(/password.*min/i)).toBeVisible();
    await expect(page.getByPlaceholder('Confirm password')).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });

  test('should switch back to Sign In form when Sign In tab is clicked', async ({ page }) => {
    // Go to sign up first
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await expect(page.getByPlaceholder('Your name')).toBeVisible();

    // Go back to sign in
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByPlaceholder('Your name')).not.toBeVisible();
    await expect(page.getByPlaceholder('Email address')).toBeVisible();
  });

  // ── Form Interaction ──────────────────────────────────────
  test('should allow typing in email and password fields', async ({ page }) => {
    const emailInput = page.getByPlaceholder('Email address');
    const passwordInput = page.getByPlaceholder('Password');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('mypassword');

    await expect(emailInput).toHaveValue('test@example.com');
    await expect(passwordInput).toHaveValue('mypassword');
  });

  // ── Divider ───────────────────────────────────────────────
  test('should display "or" divider between form and Google button', async ({ page }) => {
    const divider = page.getByText('or');
    await expect(divider).toBeVisible({ timeout: 10000 });
  });
});

test.describe('App UI (authenticated)', () => {
  // These tests would require mocking Firebase auth in the browser context.
  // For now, we test structural elements that can be verified.

  test('should have the gem icon ✦ on the auth screen', async ({ page }) => {
    await page.goto('/');
    const gem = page.getByText('✦');
    await expect(gem).toBeVisible({ timeout: 10000 });
  });
});
