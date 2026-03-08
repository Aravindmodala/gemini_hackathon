/**
 * E2E Tests — Backend Connectivity
 *
 * Validates that the frontend can establish a connection to the backend.
 * These tests require the backend to be running on port 3001.
 *
 * Run with:
 *   cd emotional-chronicler && uvicorn main:app --port 3001 --reload
 *   cd frontend-react && npx playwright test e2e/connectivity.spec.ts
 */
import { test, expect } from '@playwright/test';

test.describe('Backend Connectivity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ── WebSocket Endpoint Availability ───────────────────────
  test('should be able to reach the backend API docs', async ({ request }) => {
    // The backend Swagger UI at /docs verifies the FastAPI server is up
    const response = await request.get('http://localhost:3001/docs');
    expect(response.status()).toBe(200);
  });

  test('should be able to reach the backend root endpoint', async ({ request }) => {
    // GET / serves the frontend index.html (or 404 if dist not built)
    const response = await request.get('http://localhost:3001/');
    // Accept both 200 (if dist exists) and 500/404 (if dist not built)
    // The important thing is the server responds
    expect(response.status()).toBeLessThan(502);
  });

  // ── WebSocket Connection ──────────────────────────────────
  test('should attempt WebSocket connection when "Talk to Elora" is clicked', async ({ page }) => {
    // Listen for WebSocket connections
    const wsConnections: string[] = [];

    page.on('websocket', (ws) => {
      wsConnections.push(ws.url());
    });

    // Grant microphone permissions
    await page.context().grantPermissions(['microphone']);

    // Click the Talk to Elora button
    const button = page.locator('.hud-btn');
    await button.click();

    // Wait a bit for the WebSocket connection attempt
    await page.waitForTimeout(2000);

    // Verify a WebSocket connection was attempted to the correct URL
    expect(wsConnections.length).toBeGreaterThanOrEqual(1);
    const wsUrl = wsConnections[0];
    expect(wsUrl).toContain('localhost:3001/ws');
  });

  test('should transition away from "disconnected" after clicking Talk', async ({ page }) => {
    // Grant microphone permissions
    await page.context().grantPermissions(['microphone']);

    // Click the Talk to Elora button
    await page.locator('.hud-btn').click();

    // The status should change from DISCONNECTED to something else
    // within a reasonable time (CONNECTING, CONNECTED, etc.)
    await expect(page.locator('.conn-dot__label')).not.toHaveText('DISCONNECTED', {
      timeout: 5000,
    });
  });

  // ── Backend Health Check via Page Evaluation ──────────────
  test('should verify WebSocket endpoint is reachable via JavaScript', async ({ page }) => {
    // Use page.evaluate to attempt a WebSocket connection directly
    const result = await page.evaluate(async () => {
      return new Promise<{ connected: boolean; url: string }>((resolve) => {
        try {
          const ws = new WebSocket('ws://localhost:3001/ws');
          const timeout = setTimeout(() => {
            ws.close();
            resolve({ connected: false, url: ws.url });
          }, 3000);

          ws.onopen = () => {
            clearTimeout(timeout);
            ws.close();
            resolve({ connected: true, url: ws.url });
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            resolve({ connected: false, url: ws.url });
          };
        } catch {
          resolve({ connected: false, url: 'ws://localhost:3001/ws' });
        }
      });
    });

    expect(result.url).toBe('ws://localhost:3001/ws');
    // The backend is running, so it should connect
    expect(result.connected).toBe(true);
  });

  // ── Connection Status Recovery ────────────────────────────
  test('should show error state gracefully if backend is unreachable on different port', async ({ page }) => {
    // Try to evaluate a connection to a port that definitely isn't running
    const result = await page.evaluate(async () => {
      return new Promise<boolean>((resolve) => {
        try {
          const ws = new WebSocket('ws://localhost:9999/ws');
          const timeout = setTimeout(() => {
            ws.close();
            resolve(false);
          }, 2000);

          ws.onopen = () => {
            clearTimeout(timeout);
            ws.close();
            resolve(true);
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
          };
        } catch {
          resolve(false);
        }
      });
    });

    // Should NOT connect to a non-existent server
    expect(result).toBe(false);
  });
});
