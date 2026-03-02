/* global process */
import { expect, test } from '@playwright/test';

const CREATOR_USERNAME = process.env.E2E_CREATOR_USERNAME;
const CREATOR_PASSWORD = process.env.E2E_CREATOR_PASSWORD || 'Pass1234!';
const PLAYER_USERNAME = process.env.E2E_PLAYER_USERNAME;
const PLAYER_PASSWORD = process.env.E2E_PLAYER_PASSWORD || 'Pass1234!';
const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://127.0.0.1:8010/api';

test.skip(
    !CREATOR_USERNAME || !PLAYER_USERNAME,
    'Set E2E_CREATOR_USERNAME and E2E_PLAYER_USERNAME for persistent hold E2E.',
);

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const authHeaders = (token) => ({
    Authorization: `Token ${token}`,
});

const login = async (page, username, password) => {
    await page.goto('/login');
    await page.getByTestId('login-identifier').fill(username);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/$/);
};

const getStoredToken = async (page) => page.evaluate(
    () => localStorage.getItem('digichess_token') || '',
);

const fetchMe = async (request, token) => {
    const response = await request.get(`${API_BASE_URL}/accounts/me/`, {
        headers: authHeaders(token),
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
};

const createGame = async (request, creatorToken, opponentId) => {
    const response = await request.post(`${API_BASE_URL}/games/`, {
        headers: authHeaders(creatorToken),
        data: {
            opponent_id: opponentId,
            preferred_color: 'white',
            time_control: 'blitz',
            rated: false,
        },
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
};

const acceptGame = async (request, token, gameId) => {
    const response = await request.post(`${API_BASE_URL}/games/${gameId}/accept/`, {
        headers: authHeaders(token),
        data: {},
    });
    expect(response.ok()).toBeTruthy();
};

const submitMove = async (request, token, gameId, sanMove) => {
    const response = await request.post(`${API_BASE_URL}/games/${gameId}/move/`, {
        headers: authHeaders(token),
        data: { move: sanMove },
    });
    expect(response.ok()).toBeTruthy();
};

const fetchGame = async (request, token, gameId) => {
    const response = await request.get(`${API_BASE_URL}/games/${gameId}/`, {
        headers: authHeaders(token),
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
};

const waitForGameStatus = async (request, token, gameId, status, timeoutMs = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const game = await fetchGame(request, token, gameId);
        if (game.status === status) return game;
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`Timed out waiting for game ${gameId} status=${status}`);
};

const waitForMoves = async (request, token, gameId, expectedMoves, timeoutMs = 15000) => {
    const expected = expectedMoves.trim();
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const game = await fetchGame(request, token, gameId);
        const moves = (game.moves || '').trim();
        if (moves === expected) return game;
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`Timed out waiting for moves "${expected}" in game ${gameId}`);
};

const squareCenter = async (page, square, orientation = 'white') => {
    const board = page.getByTestId('game-board');
    const box = await board.boundingBox();
    expect(box).toBeTruthy();
    const file = square[0];
    const rank = Number(square[1]);
    const fileIndex = FILES.indexOf(file);
    const displayCol = orientation === 'white' ? fileIndex : 7 - fileIndex;
    const displayRow = orientation === 'white' ? 8 - rank : rank - 1;
    const squareSize = box.width / 8;
    return {
        x: box.x + (displayCol + 0.5) * squareSize,
        y: box.y + (displayRow + 0.5) * squareSize,
    };
};

const holdPiece = async (page, fromSquare) => {
    const from = await squareCenter(page, fromSquare, 'white');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
};

const releasePiece = async (page, toSquare) => {
    const to = await squareCenter(page, toSquare, 'white');
    await page.mouse.move(to.x, to.y);
    await page.mouse.up();
};

const setupActiveGame = async (request, creatorToken, playerToken) => {
    const playerMe = await fetchMe(request, playerToken);
    const game = await createGame(request, creatorToken, playerMe.id);
    await acceptGame(request, playerToken, game.id);
    await waitForGameStatus(request, creatorToken, game.id, 'active');
    return game.id;
};

test('hold persists through opponent move and releases with latest legal validation', async ({ browser, request }) => {
    const creatorContext = await browser.newContext();
    const creatorPage = await creatorContext.newPage();
    await login(creatorPage, CREATOR_USERNAME, CREATOR_PASSWORD);
    const creatorToken = await getStoredToken(creatorPage);
    expect(creatorToken).not.toEqual('');

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await login(playerPage, PLAYER_USERNAME, PLAYER_PASSWORD);
    const playerToken = await getStoredToken(playerPage);
    expect(playerToken).not.toEqual('');

    const gameId = await setupActiveGame(request, creatorToken, playerToken);

    await creatorPage.goto(`/game/${gameId}`);
    await expect(creatorPage.getByTestId('game-board')).toBeVisible();

    await submitMove(request, creatorToken, gameId, 'e4');
    await waitForMoves(request, creatorToken, gameId, 'e4');

    await holdPiece(creatorPage, 'g1');
    await submitMove(request, playerToken, gameId, 'e5');
    await waitForMoves(request, creatorToken, gameId, 'e4 e5');

    await expect(creatorPage.getByTestId('drag-ghost')).toBeVisible();
    await releasePiece(creatorPage, 'f3');
    await waitForMoves(request, creatorToken, gameId, 'e4 e5 Nf3');
});

test('captured held piece remains held until release and then snaps back without move', async ({ browser, request }) => {
    const creatorContext = await browser.newContext();
    const creatorPage = await creatorContext.newPage();
    await login(creatorPage, CREATOR_USERNAME, CREATOR_PASSWORD);
    const creatorToken = await getStoredToken(creatorPage);
    expect(creatorToken).not.toEqual('');

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await login(playerPage, PLAYER_USERNAME, PLAYER_PASSWORD);
    const playerToken = await getStoredToken(playerPage);
    expect(playerToken).not.toEqual('');

    const gameId = await setupActiveGame(request, creatorToken, playerToken);

    await creatorPage.goto(`/game/${gameId}`);
    await expect(creatorPage.getByTestId('game-board')).toBeVisible();

    await submitMove(request, creatorToken, gameId, 'e4');
    await submitMove(request, playerToken, gameId, 'd5');
    await submitMove(request, creatorToken, gameId, 'exd5');
    await waitForMoves(request, creatorToken, gameId, 'e4 d5 exd5');

    await holdPiece(creatorPage, 'd5');
    await submitMove(request, playerToken, gameId, 'Qxd5');
    await waitForMoves(request, creatorToken, gameId, 'e4 d5 exd5 Qxd5');

    await expect(creatorPage.getByTestId('drag-ghost')).toBeVisible();
    await releasePiece(creatorPage, 'd6');
    await waitForMoves(request, creatorToken, gameId, 'e4 d5 exd5 Qxd5');
});

test('tap premove flow remains unchanged while waiting for opponent move', async ({ browser, request }) => {
    const creatorContext = await browser.newContext();
    const creatorPage = await creatorContext.newPage();
    await login(creatorPage, CREATOR_USERNAME, CREATOR_PASSWORD);
    const creatorToken = await getStoredToken(creatorPage);
    expect(creatorToken).not.toEqual('');

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await login(playerPage, PLAYER_USERNAME, PLAYER_PASSWORD);
    const playerToken = await getStoredToken(playerPage);
    expect(playerToken).not.toEqual('');

    const gameId = await setupActiveGame(request, creatorToken, playerToken);

    await creatorPage.goto(`/game/${gameId}`);
    await expect(creatorPage.getByTestId('game-board')).toBeVisible();

    await submitMove(request, creatorToken, gameId, 'e4');
    await waitForMoves(request, creatorToken, gameId, 'e4');

    await creatorPage.locator('[data-square="g1"]').click();
    await creatorPage.locator('[data-square="f3"]').click();
    await expect(creatorPage.locator('[data-square="g1"]')).toHaveAttribute('data-premove', 'true');
    await expect(creatorPage.locator('[data-square="f3"]')).toHaveAttribute('data-premove', 'true');

    await submitMove(request, playerToken, gameId, 'e5');
    await waitForMoves(request, creatorToken, gameId, 'e4 e5 Nf3');
    await expect(creatorPage.locator('[data-square="g1"]')).toHaveAttribute('data-premove', 'false');
    await expect(creatorPage.locator('[data-square="f3"]')).toHaveAttribute('data-premove', 'false');
});
