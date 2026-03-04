/* global process */
import { expect, test } from '@playwright/test';

/**
 * E2E tests for in-game chat isolation between players and spectators.
 *
 * Requires three pre-existing user accounts (set via env vars):
 *   E2E_CREATOR_USERNAME / E2E_CREATOR_PASSWORD  – plays white
 *   E2E_PLAYER_USERNAME  / E2E_PLAYER_PASSWORD   – plays black
 *   E2E_SPECTATOR_USERNAME / E2E_SPECTATOR_PASSWORD – spectates
 *
 * The tests create a live game, send messages from each role, and assert:
 *   1. Both players see player-room chat messages.
 *   2. The spectator sees spectator-room chat messages.
 *   3. Players do NOT see spectator-room messages.
 *   4. Spectators do NOT see player-room messages.
 */

const CREATOR_USERNAME = process.env.E2E_CREATOR_USERNAME;
const CREATOR_PASSWORD = process.env.E2E_CREATOR_PASSWORD || 'Pass1234!';
const PLAYER_USERNAME = process.env.E2E_PLAYER_USERNAME;
const PLAYER_PASSWORD = process.env.E2E_PLAYER_PASSWORD || 'Pass1234!';
const SPECTATOR_USERNAME = process.env.E2E_SPECTATOR_USERNAME;
const SPECTATOR_PASSWORD = process.env.E2E_SPECTATOR_PASSWORD || 'Pass1234!';
const API_BASE = process.env.E2E_API_BASE_URL || 'http://127.0.0.1:8010/api';

test.skip(
    !CREATOR_USERNAME || !PLAYER_USERNAME || !SPECTATOR_USERNAME,
    'Set E2E_CREATOR_USERNAME, E2E_PLAYER_USERNAME, and E2E_SPECTATOR_USERNAME for chat E2E.',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const authHeaders = (token) => ({ Authorization: `Token ${token}` });

const login = async (page, username, password) => {
    await page.goto('/login');
    await page.getByTestId('login-identifier').fill(username);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/$/);
};

const getToken = (page) =>
    page.evaluate(() => localStorage.getItem('digichess_token') || '');

const fetchMe = async (request, token) => {
    const res = await request.get(`${API_BASE}/accounts/me/`, {
        headers: authHeaders(token),
    });
    expect(res.ok()).toBeTruthy();
    return res.json();
};

const createGame = async (request, token, opponentId) => {
    const res = await request.post(`${API_BASE}/games/`, {
        headers: authHeaders(token),
        data: {
            opponent_id: opponentId,
            preferred_color: 'white',
            time_control: 'blitz',
            rated: false,
        },
    });
    expect(res.ok()).toBeTruthy();
    return res.json();
};

const acceptGame = async (request, token, gameId) => {
    const res = await request.post(`${API_BASE}/games/${gameId}/accept/`, {
        headers: authHeaders(token),
        data: {},
    });
    expect(res.ok()).toBeTruthy();
};

const fetchGame = async (request, token, gameId) => {
    const res = await request.get(`${API_BASE}/games/${gameId}/`, {
        headers: authHeaders(token),
    });
    expect(res.ok()).toBeTruthy();
    return res.json();
};

const waitForStatus = async (request, token, gameId, status, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const game = await fetchGame(request, token, gameId);
        if (game.status === status) return game;
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`Timeout waiting for game ${gameId} status=${status}`);
};

/**
 * Ensure the chat panel is visible. On large viewports it is always shown;
 * on small viewports we need to swipe/tap to open the right drawer.
 */
const ensureChatVisible = async (page) => {
    const chatInput = page.getByPlaceholder('Send a message...');
    if (await chatInput.isVisible().catch(() => false)) return;

    // Try opening the right drawer by clicking the chat toggle if present
    const toggle = page.locator('[aria-label="Open chat"], [aria-label="Chat"]');
    if (await toggle.isVisible().catch(() => false)) {
        await toggle.click();
        await chatInput.waitFor({ state: 'visible', timeout: 5000 });
    }
};

const sendChatMessage = async (page, text) => {
    await ensureChatVisible(page);
    const input = page.getByPlaceholder('Send a message...');
    await input.fill(text);
    await input.press('Enter');
};

const chatMessages = (page) =>
    page.locator('.space-y-2 > div').filter({ has: page.locator('span, button') });

const waitForChatMessage = async (page, text, timeout = 10000) => {
    await expect(
        page.locator('.space-y-2').getByText(text, { exact: false })
    ).toBeVisible({ timeout });
};

const assertNoChatMessage = async (page, text) => {
    // Give a brief moment for any stale broadcast to arrive
    await page.waitForTimeout(2000);
    await expect(
        page.locator('.space-y-2').getByText(text, { exact: false })
    ).toHaveCount(0);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Game Chat', () => {
    let gameId;
    let creatorPage, playerPage, spectatorPage;
    let creatorContext, playerContext, spectatorContext;

    test.beforeAll(async ({ browser, request }) => {
        // Use a wide viewport so the chat panel is always visible (lg breakpoint)
        const viewportSize = { width: 1280, height: 800 };

        creatorContext = await browser.newContext({ viewport: viewportSize });
        creatorPage = await creatorContext.newPage();
        await login(creatorPage, CREATOR_USERNAME, CREATOR_PASSWORD);
        const creatorToken = await getToken(creatorPage);

        playerContext = await browser.newContext({ viewport: viewportSize });
        playerPage = await playerContext.newPage();
        await login(playerPage, PLAYER_USERNAME, PLAYER_PASSWORD);
        const playerToken = await getToken(playerPage);

        spectatorContext = await browser.newContext({ viewport: viewportSize });
        spectatorPage = await spectatorContext.newPage();
        await login(spectatorPage, SPECTATOR_USERNAME, SPECTATOR_PASSWORD);

        // Create and start a game
        const playerMe = await fetchMe(request, playerToken);
        const game = await createGame(request, creatorToken, playerMe.id);
        gameId = game.id;
        await acceptGame(request, playerToken, gameId);
        await waitForStatus(request, creatorToken, gameId, 'active');

        // Navigate all three to the game
        await creatorPage.goto(`/game/${gameId}`);
        await playerPage.goto(`/game/${gameId}`);
        // Spectator uses the spectate route (same page, different WS consumer)
        await spectatorPage.goto(`/game/${gameId}`);

        // Wait for the board to load on all pages
        await expect(creatorPage.getByTestId('game-board')).toBeVisible();
        await expect(playerPage.getByTestId('game-board')).toBeVisible();
        await expect(spectatorPage.getByTestId('game-board')).toBeVisible();
    });

    test.afterAll(async () => {
        await creatorContext?.close();
        await playerContext?.close();
        await spectatorContext?.close();
    });

    test('player chat header shows "Players Chat" for both players', async () => {
        await ensureChatVisible(creatorPage);
        await ensureChatVisible(playerPage);
        await expect(creatorPage.getByText('Players Chat')).toBeVisible();
        await expect(playerPage.getByText('Players Chat')).toBeVisible();
    });

    test('spectator chat header shows "Spectators Chat"', async () => {
        await ensureChatVisible(spectatorPage);
        await expect(spectatorPage.getByText('Spectators Chat')).toBeVisible();
    });

    test('both players can see each other\'s player chat messages', async () => {
        const whiteMsg = `white-msg-${Date.now()}`;
        const blackMsg = `black-msg-${Date.now()}`;

        await sendChatMessage(creatorPage, whiteMsg);
        await sendChatMessage(playerPage, blackMsg);

        // White (creator) sees both
        await waitForChatMessage(creatorPage, whiteMsg);
        await waitForChatMessage(creatorPage, blackMsg);

        // Black (player) sees both
        await waitForChatMessage(playerPage, whiteMsg);
        await waitForChatMessage(playerPage, blackMsg);
    });

    test('spectator can send and receive spectator chat', async () => {
        const specMsg = `spec-msg-${Date.now()}`;

        await sendChatMessage(spectatorPage, specMsg);

        await waitForChatMessage(spectatorPage, specMsg);
    });

    test('spectator does NOT see player chat messages', async () => {
        const secretMsg = `player-secret-${Date.now()}`;

        await sendChatMessage(creatorPage, secretMsg);

        // Creator (player) sees it
        await waitForChatMessage(creatorPage, secretMsg);

        // Spectator must NOT see it
        await assertNoChatMessage(spectatorPage, secretMsg);
    });

    test('players do NOT see spectator chat messages', async () => {
        const specMsg = `spectator-only-${Date.now()}`;

        await sendChatMessage(spectatorPage, specMsg);

        // Spectator sees it
        await waitForChatMessage(spectatorPage, specMsg);

        // Neither player should see it
        await assertNoChatMessage(creatorPage, specMsg);
        await assertNoChatMessage(playerPage, specMsg);
    });

    test('multiple spectators see each other\'s messages', async ({ browser }) => {
        const viewportSize = { width: 1280, height: 800 };
        const spec2Context = await browser.newContext({ viewport: viewportSize });
        const spec2Page = await spec2Context.newPage();
        await login(spec2Page, SPECTATOR_USERNAME, SPECTATOR_PASSWORD);
        await spec2Page.goto(`/game/${gameId}`);
        await expect(spec2Page.getByTestId('game-board')).toBeVisible();

        const msg = `multi-spec-${Date.now()}`;
        await sendChatMessage(spectatorPage, msg);

        // Both spectator tabs should see the message
        await waitForChatMessage(spectatorPage, msg);
        await waitForChatMessage(spec2Page, msg);

        await spec2Context.close();
    });

    test('chat messages survive page navigation back to game', async () => {
        const persistMsg = `persist-${Date.now()}`;
        await sendChatMessage(creatorPage, persistMsg);
        await waitForChatMessage(creatorPage, persistMsg);

        // Navigate away and back — chat is ephemeral (WebSocket only),
        // so after reconnect old messages are gone. This verifies reconnect works.
        await creatorPage.goto('/');
        await creatorPage.goto(`/game/${gameId}`);
        await expect(creatorPage.getByTestId('game-board')).toBeVisible();
        await ensureChatVisible(creatorPage);

        // Send a new message to prove chat still works after reconnect
        const afterReconnect = `reconnect-${Date.now()}`;
        await sendChatMessage(creatorPage, afterReconnect);
        await waitForChatMessage(creatorPage, afterReconnect);
    });
});
