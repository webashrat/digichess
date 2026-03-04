/* global process */
import { expect, test } from '@playwright/test';

const USERS = [
    { username: process.env.E2E_CREATOR_USERNAME, password: process.env.E2E_CREATOR_PASSWORD || 'Raj@2624' },
    { username: process.env.E2E_PLAYER_USERNAME, password: process.env.E2E_PLAYER_PASSWORD || 'Raj@2624' },
    { username: process.env.E2E_PLAYER3_USERNAME || 'duhless', password: process.env.E2E_PLAYER3_PASSWORD || 'Raj@2624' },
    { username: process.env.E2E_PLAYER4_USERNAME || 'blitzorddd', password: process.env.E2E_PLAYER4_PASSWORD || 'Raj@2624' },
];

test.skip(
    !USERS[0].username || !USERS[1].username,
    'Set E2E_CREATOR_USERNAME and E2E_PLAYER_USERNAME for tournament E2E.',
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
    await expect(page).toHaveURL(/\/$/, { timeout: 10000 });
};

const api = async (page, method, path, data) => {
    return page.evaluate(async ({ method, path, data }) => {
        const token = localStorage.getItem('digichess_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Token ${token}`;
        const resp = await fetch(path, {
            method,
            headers,
            credentials: 'include',
            body: data ? JSON.stringify(data) : undefined,
        });
        let body = null;
        try { body = await resp.json(); } catch { /* empty */ }
        return { status: resp.status, body };
    }, { method, path, data });
};

const ITALIAN_GAME = [
    'e2e4', 'e7e5',
    'g1f3', 'b8c6',
    'f1c4', 'f8c5',
    'd2d3', 'g8f6',
    'b1c3', 'd7d6',
    'c1e3', 'c5e3',
    'f2e3', 'c8e6',
    'c4e6', 'f7e6',
    'e1g1', 'e8g8',
    'd1e2', 'a7a6',
];

test.describe('Tournament lifecycle - visual demo', () => {
    test('blitz arena: 4 players, real Italian Game moves, visual check every step', async ({ browser }) => {
        test.setTimeout(600000);

        // ── Login all 4 players ──
        const contexts = [];
        const pages = [];
        for (const user of USERS) {
            const ctx = await browser.newContext();
            const page = await ctx.newPage();
            await login(page, user.username, user.password);
            contexts.push(ctx);
            pages.push(page);
        }
        const [creatorPage, p2, p3, p4] = pages;

        // ── Step 1: Create blitz arena tournament via UI ──
        await creatorPage.goto('/tournaments');
        await creatorPage.waitForTimeout(1000);
        await creatorPage.getByTestId('tournaments-create-button').click();
        await expect(creatorPage.getByTestId('tournament-create-modal')).toBeVisible();

        const name = `Blitz Arena Demo ${Date.now()}`;
        await creatorPage.getByTestId('create-tournament-name').fill(name);
        await creatorPage.getByTestId('create-tournament-description').fill('E2E visual demo with real moves');
        await creatorPage.getByTestId('create-tournament-type').selectOption('arena');
        await creatorPage.getByTestId('create-tournament-time-control').selectOption('blitz');
        await creatorPage.getByTestId('create-tournament-initial-seconds').fill('180');
        await creatorPage.getByTestId('create-tournament-increment-seconds').fill('2');
        await creatorPage.getByTestId('create-tournament-arena-duration').fill('15');
        await creatorPage.getByTestId('create-tournament-start-at').fill(toDatetimeLocal(2));
        await creatorPage.getByTestId('create-tournament-submit').click();

        await expect(creatorPage).toHaveURL(/\/tournaments\/\d+/);
        const tournamentId = creatorPage.url().match(/\/tournaments\/(\d+)/)?.[1];
        expect(tournamentId).toBeTruthy();

        // ── Pause to see tournament page ──
        await creatorPage.waitForTimeout(2000);
        await expect(creatorPage.getByTestId('tournament-status-badge')).toContainText(/Upcoming/);

        // ── Step 2: All 4 players register ──
        for (const page of pages) {
            await api(page, 'POST', `/api/games/tournaments/${tournamentId}/register/`, {});
        }

        // ── Step 3: Start tournament ──
        const startResult = await api(creatorPage, 'POST', `/api/games/tournaments/${tournamentId}/start/`, {});
        expect([200, 400]).toContain(startResult.status);
        await creatorPage.waitForTimeout(1000);

        // Trigger pairings
        await api(creatorPage, 'POST', `/api/games/tournaments/${tournamentId}/pairings/`, {});
        await creatorPage.waitForTimeout(2000);
        await api(creatorPage, 'POST', `/api/games/tournaments/${tournamentId}/pairings/`, {});
        await creatorPage.waitForTimeout(2000);

        // ── Step 4: Find game assignments for all players ──
        const playerGames = {};
        for (let attempt = 0; attempt < 20; attempt++) {
            for (let i = 0; i < pages.length; i++) {
                if (playerGames[i]) continue;
                const r = await api(pages[i], 'GET', `/api/games/tournaments/${tournamentId}/my-game/`);
                if (r.body?.game_id) playerGames[i] = String(r.body.game_id);
            }
            if (Object.keys(playerGames).length >= 4) break;
            await pages[0].waitForTimeout(2000);
            if (attempt % 3 === 2) {
                await api(creatorPage, 'POST', `/api/games/tournaments/${tournamentId}/pairings/`, {});
            }
        }
        const paired = Object.keys(playerGames);
        expect(paired.length).toBeGreaterThanOrEqual(2);

        // ── Step 5: Navigate all paired players to their game pages ──
        for (const idx of paired) {
            await pages[idx].goto(`/game/${playerGames[idx]}`);
        }
        await pages[0].waitForTimeout(2000);

        // ── Step 6: Verify no abort button, no first-move timer ──
        for (const idx of paired) {
            const abortBtn = pages[idx].locator('button:has-text("Abort")');
            await expect(abortBtn).not.toBeVisible({ timeout: 3000 });
        }

        // ── Step 7: Play Italian Game moves on game 1 ──
        const game1Id = playerGames[paired[0]];
        const gameInfo = await api(pages[paired[0]], 'GET', `/api/games/${game1Id}/`);
        const whiteUsername = gameInfo.body?.white?.username;

        const whiteIdx = USERS[paired[0]].username === whiteUsername ? paired[0] : paired[1];
        const blackIdx = whiteIdx === paired[0] ? paired[1] : paired[0];

        for (let i = 0; i < ITALIAN_GAME.length; i++) {
            const move = ITALIAN_GAME[i];
            const page = i % 2 === 0 ? pages[whiteIdx] : pages[blackIdx];
            const result = await api(page, 'POST', `/api/games/${game1Id}/move/`, { move });
            if (result.status !== 200) break;
            // Slow pause so you can see each move on the board
            await page.waitForTimeout(800);
        }

        // ── Pause to see the final position ──
        await pages[whiteIdx].waitForTimeout(3000);

        // ── Step 8: Play some moves on game 2 if it exists ──
        if (paired.length >= 4) {
            const game2Id = playerGames[paired[2]];
            const game2Info = await api(pages[paired[2]], 'GET', `/api/games/${game2Id}/`);
            const w2 = USERS[paired[2]].username === game2Info.body?.white?.username ? paired[2] : paired[3];
            const b2 = w2 === paired[2] ? paired[3] : paired[2];

            const SICILIAN = ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6'];
            for (let i = 0; i < SICILIAN.length; i++) {
                const page = i % 2 === 0 ? pages[w2] : pages[b2];
                const result = await api(page, 'POST', `/api/games/${game2Id}/move/`, { move: SICILIAN[i] });
                if (result.status !== 200) break;
                await page.waitForTimeout(800);
            }
            await pages[w2].waitForTimeout(2000);

            // Resign game 2
            await api(pages[b2], 'POST', `/api/games/${game2Id}/resign/`, {});
            await pages[b2].waitForTimeout(2000);
            await pages[b2].reload();
            await pages[b2].waitForTimeout(1500);

            // Verify no rematch on game 2
            await expect(pages[b2].locator('button:has-text("Rematch")')).not.toBeVisible({ timeout: 3000 });

            // Click Back to Tournament
            const back2 = pages[b2].getByTestId('back-to-tournament');
            if (await back2.isVisible({ timeout: 3000 }).catch(() => false)) {
                await back2.click();
                await pages[b2].waitForTimeout(2000);
            }
        }

        // ── Step 9: Resign game 1 ──
        await api(pages[blackIdx], 'POST', `/api/games/${game1Id}/resign/`, {});
        await pages[blackIdx].waitForTimeout(2000);
        await pages[blackIdx].reload();
        await pages[blackIdx].waitForTimeout(2000);

        // ── Step 10: Verify no rematch, back-to-tournament visible ──
        await expect(pages[blackIdx].locator('button:has-text("Rematch")')).not.toBeVisible({ timeout: 5000 });
        const backBtn = pages[blackIdx].getByTestId('back-to-tournament');
        await expect(backBtn).toBeVisible({ timeout: 5000 });

        // ── Pause to see game over screen ──
        await pages[blackIdx].waitForTimeout(3000);

        // ── Step 11: Click Back to Tournament ──
        await backBtn.click();
        await expect(pages[blackIdx]).toHaveURL(new RegExp(`/tournaments/${tournamentId}`), { timeout: 10000 });
        await pages[blackIdx].waitForTimeout(3000);

        // ── Step 12: Check live standings ──
        const liveStandings = pages[blackIdx].locator('text=Live Standings');
        const hasLive = await liveStandings.isVisible({ timeout: 3000 }).catch(() => false);
        if (hasLive) {
            await pages[blackIdx].waitForTimeout(2000);
        }

        // ── Step 13: Click Standings tab ──
        const standingsTab = pages[blackIdx].locator('button:has-text("Standings")');
        if (await standingsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
            await standingsTab.click();
            await pages[blackIdx].waitForTimeout(2000);
        }

        // ── Step 14: Click Info tab ──
        const infoTab = pages[blackIdx].locator('button:has-text("Info")');
        if (await infoTab.isVisible({ timeout: 2000 }).catch(() => false)) {
            await infoTab.click();
            await pages[blackIdx].waitForTimeout(2000);
            await expect(pages[blackIdx].locator('text=Tournament Details')).toBeVisible({ timeout: 5000 });
        }

        // ── Step 15: Go back to My Game tab ──
        const gameTab = pages[blackIdx].locator('button:has-text("My Game")');
        if (await gameTab.isVisible({ timeout: 2000 }).catch(() => false)) {
            await gameTab.click();
            await pages[blackIdx].waitForTimeout(2000);
        }

        // ── Step 16: Finish tournament ──
        const winners = paired.map((idx) => USERS[idx].username);
        const finishResult = await api(
            creatorPage, 'POST',
            `/api/games/tournaments/${tournamentId}/finish/`,
            { winners: winners.slice(0, 3) },
        );
        expect([200, 400]).toContain(finishResult.status);

        // ── Step 17: Verify completed state ──
        await pages[blackIdx].waitForTimeout(2000);
        await pages[blackIdx].goto(`/tournaments/${tournamentId}`);
        await pages[blackIdx].waitForTimeout(3000);

        const badge = pages[blackIdx].getByTestId('tournament-status-badge');
        await expect(badge).toBeVisible({ timeout: 20000 });
        await expect(badge).toContainText('Completed', { timeout: 10000 });

        // ── Pause to see completed state ──
        await pages[blackIdx].waitForTimeout(3000);

        // ── Step 18: Verify podium ──
        await expect(pages[blackIdx].getByTestId('tournament-winners-list')).toBeVisible({ timeout: 10000 });
        await pages[blackIdx].waitForTimeout(2000);

        // ── Step 19: Click Final Standings tab ──
        const finalTab = pages[blackIdx].locator('button:has-text("Final Standings")');
        if (await finalTab.isVisible({ timeout: 3000 }).catch(() => false)) {
            await finalTab.click();
            await pages[blackIdx].waitForTimeout(3000);
        }

        // ── Step 20: Click Info tab on completed view ──
        const infoTab2 = pages[blackIdx].locator('button:has-text("Info")');
        if (await infoTab2.isVisible({ timeout: 2000 }).catch(() => false)) {
            await infoTab2.click();
            await pages[blackIdx].waitForTimeout(2000);
        }

        // ── Cleanup ──
        for (const ctx of contexts) await ctx.close();
    });
});
