/* global process */
import { expect, test } from '@playwright/test';

const CREATOR_USERNAME = process.env.E2E_CREATOR_USERNAME;
const CREATOR_PASSWORD = process.env.E2E_CREATOR_PASSWORD || 'Pass1234!';
const PLAYER_USERNAME = process.env.E2E_PLAYER_USERNAME;
const PLAYER_PASSWORD = process.env.E2E_PLAYER_PASSWORD || 'Pass1234!';
const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://127.0.0.1:8010/api';

test.skip(
    !CREATOR_USERNAME || !PLAYER_USERNAME,
    'Set E2E_CREATOR_USERNAME and E2E_PLAYER_USERNAME for tournament live E2E.',
);

const toDatetimeLocal = (minutesFromNow) => {
    const target = new Date(Date.now() + minutesFromNow * 60 * 1000);
    target.setSeconds(0, 0);
    const local = new Date(target.getTime() - target.getTimezoneOffset() * 60 * 1000);
    return local.toISOString().slice(0, 16);
};

const login = async (page, username, password) => {
    await page.goto('/login');
    await page.getByTestId('login-identifier').fill(username);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/$/);
};

test('tournament creation and live play flow works', async ({ browser, request }) => {
    const creatorContext = await browser.newContext();
    const creatorPage = await creatorContext.newPage();
    await login(creatorPage, CREATOR_USERNAME, CREATOR_PASSWORD);

    await creatorPage.goto('/tournaments');
    await creatorPage.getByTestId('tournaments-create-button').click();
    await expect(creatorPage.getByTestId('tournament-create-modal')).toBeVisible();

    const tournamentName = `E2E Arena ${Date.now()}`;
    await creatorPage.getByTestId('create-tournament-name').fill(tournamentName);
    await creatorPage.getByTestId('create-tournament-description').fill('Playwright tournament live flow');
    await creatorPage.getByTestId('create-tournament-type').selectOption('arena');
    await creatorPage.getByTestId('create-tournament-time-control').selectOption('blitz');
    await creatorPage.getByTestId('create-tournament-initial-seconds').fill('120');
    await creatorPage.getByTestId('create-tournament-increment-seconds').fill('0');
    await creatorPage.getByTestId('create-tournament-arena-duration').fill('10');
    await creatorPage.getByTestId('create-tournament-start-at').fill(toDatetimeLocal(2));
    await creatorPage.getByTestId('create-tournament-submit').click();

    await expect(creatorPage).toHaveURL(/\/tournaments\/\d+/);
    const creatorUrl = creatorPage.url();
    const tournamentIdMatch = creatorUrl.match(/\/tournaments\/(\d+)/);
    expect(tournamentIdMatch).toBeTruthy();
    const tournamentId = Number(tournamentIdMatch[1]);

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await login(playerPage, PLAYER_USERNAME, PLAYER_PASSWORD);
    await playerPage.goto(`/tournaments/${tournamentId}`);

    const statusBadge = playerPage.getByTestId('tournament-status-badge');
    await expect(statusBadge).toContainText(/Upcoming|Live/);

    if ((await statusBadge.textContent())?.includes('Upcoming')) {
        const secondsLocator = playerPage.getByTestId('tournament-countdown-seconds');
        await expect(secondsLocator).toBeVisible();
        const before = await secondsLocator.textContent();
        await playerPage.waitForTimeout(1300);
        const after = await secondsLocator.textContent();
        expect(before).not.toEqual(after);
    }

    if (await playerPage.getByTestId('tournament-register').isVisible()) {
        await playerPage.getByTestId('tournament-register').click();
    }

    const creatorToken = await creatorPage.evaluate(
        () => localStorage.getItem('digichess_token') || '',
    );
    expect(creatorToken).not.toEqual('');
    const creatorRegisterResp = await request.post(`${API_BASE_URL}/games/tournaments/${tournamentId}/register/`, {
        headers: {
            Authorization: `Token ${creatorToken}`,
        },
        data: {},
    });
    expect([200, 400]).toContain(creatorRegisterResp.status());

    const startResp = await request.post(`${API_BASE_URL}/games/tournaments/${tournamentId}/start/`, {
        headers: {
            Authorization: `Token ${creatorToken}`,
        },
        data: {},
    });
    expect([200, 400]).toContain(startResp.status());

    await playerPage.reload();
    await expect(playerPage.getByTestId('tournament-status-badge')).toContainText('Live', {
        timeout: 30000,
    });

    const goToGameButton = playerPage.getByTestId('tournament-go-to-game');
    await expect(goToGameButton).toBeVisible({ timeout: 30000 });
    await expect(goToGameButton).toHaveText(/Go to My Game/, { timeout: 30000 });
    await goToGameButton.click();
    await expect(playerPage).toHaveURL(/\/game\/\d+/);
    const gameIdMatch = playerPage.url().match(/\/game\/(\d+)/);
    expect(gameIdMatch).toBeTruthy();
    const gameId = Number(gameIdMatch[1]);

    const playerToken = await playerPage.evaluate(
        () => localStorage.getItem('digichess_token') || '',
    );
    expect(playerToken).not.toEqual('');
    await request.post(`${API_BASE_URL}/games/${gameId}/finish/`, {
        headers: {
            Authorization: `Token ${playerToken}`,
        },
        data: { result: '1-0' },
    });

    const finishResp = await request.post(`${API_BASE_URL}/games/tournaments/${tournamentId}/finish/`, {
        headers: {
            Authorization: `Token ${creatorToken}`,
        },
        data: { winners: [PLAYER_USERNAME, CREATOR_USERNAME] },
    });
    expect([200, 400]).toContain(finishResp.status());

    await playerPage.goto(`/tournaments/${tournamentId}`);
    await expect(playerPage.getByTestId('tournament-status-badge')).toContainText('Completed', {
        timeout: 20000,
    });
    await expect(playerPage.getByTestId('tournament-winners-list')).toBeVisible();
});
