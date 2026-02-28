import { expect, test } from '@playwright/test';

const ROUND_DATE = '2026-02-28';
const ROUND_ID = 4242;

const jsonHeaders = {
    'content-type': 'application/json',
};

const roundMeta = {
    id: ROUND_ID,
    round_date: ROUND_DATE,
    join_open_at: '2026-02-28T17:50:00Z',
    start_at: '2026-02-28T18:00:00Z',
    end_at: '2026-02-28T18:06:40Z',
    questions_count: 20,
    question_duration_seconds: 20,
    is_official: false,
};

const buildState = ({
    phase,
    joined,
    joinEnabled,
    countdownSeconds,
    currentQuestionNo,
    userPoints = 20,
    userRank = 1,
    userResolved = 1,
    participationId = 501,
}) => ({
    server_time: '2026-02-28T18:00:10Z',
    timezone: 'Asia/Kolkata',
    first_official_round_ist: '2026-03-01T23:30:00+05:30',
    round: {
        ...roundMeta,
        status: phase === 'results' ? 'finished' : phase,
        phase,
        finalized_at: phase === 'results' ? '2026-02-28T18:06:41Z' : null,
        current_question_no: currentQuestionNo ?? (phase === 'live' ? 1 : 21),
        countdown_seconds: countdownSeconds,
    },
    join_enabled: joinEnabled,
    user: joined ? {
        joined: true,
        participation_id: participationId,
        points: userPoints,
        rank: userRank,
        resolved: userResolved,
    } : {
        joined: false,
        participation_id: null,
        points: 0,
        rank: null,
        resolved: 0,
    },
});

const liveQuestionPayload = {
    phase: 'live',
    round: {
        ...roundMeta,
        status: 'live',
        phase: 'live',
        finalized_at: null,
        current_question_no: 1,
        countdown_seconds: 360,
    },
    participation: {
        id: 501,
        points: 20,
        correct: 1,
        wrong: 0,
        resolved: 1,
        joined_question_no: 1,
    },
    question: {
        question_no: 1,
        question: 'What is the chemical symbol for Lead?',
        options: ['Pb', 'Kr', 'Be', 'Cm'],
        starts_at: '2026-02-28T18:00:00Z',
        ends_at: '2026-02-28T18:00:20Z',
        seconds_left: 18,
        answered: false,
    },
};

const standingsPayload = {
    phase: 'live',
    round: {
        ...roundMeta,
        status: 'live',
        phase: 'live',
        finalized_at: null,
        current_question_no: 1,
        countdown_seconds: 360,
    },
    total_participants: 3,
    rows: [
        {
            rank: 1,
            user_id: 100,
            username: 'You',
            points: 20,
            correct: 1,
            wrong: 0,
            resolved: 1,
            progress: 1,
            total_answer_time_ms: 850,
            accuracy: 100,
            joined_question_no: 1,
        },
        {
            rank: 2,
            user_id: 101,
            username: 'ChessWiz99',
            points: 19,
            correct: 1,
            wrong: 0,
            resolved: 1,
            progress: 1,
            total_answer_time_ms: 1120,
            accuracy: 100,
            joined_question_no: 1,
        },
        {
            rank: 3,
            user_id: 102,
            username: 'RookTakesAll',
            points: 18,
            correct: 1,
            wrong: 0,
            resolved: 1,
            progress: 1,
            total_answer_time_ms: 1500,
            accuracy: 100,
            joined_question_no: 1,
        },
    ],
    your_row: {
        rank: 1,
        user_id: 100,
        username: 'You',
        points: 20,
        correct: 1,
        wrong: 0,
        resolved: 1,
        progress: 1,
        total_answer_time_ms: 850,
        accuracy: 100,
        joined_question_no: 1,
    },
};

const resultsPayload = {
    round: {
        ...roundMeta,
        status: 'finished',
        phase: 'results',
        finalized_at: '2026-02-28T18:06:41Z',
        current_question_no: 21,
        countdown_seconds: 86399,
    },
    total_participants: 3,
    total_pages: 1,
    page: 1,
    limit: 100,
    podium: standingsPayload.rows.slice(0, 3),
    rows: standingsPayload.rows,
    your_row: standingsPayload.your_row,
};

const lateJoinLiveQuestionPayload = {
    phase: 'live',
    round: {
        ...roundMeta,
        status: 'live',
        phase: 'live',
        finalized_at: null,
        current_question_no: 4,
        countdown_seconds: 220,
    },
    participation: {
        id: 777,
        points: -45,
        correct: 0,
        wrong: 3,
        resolved: 3,
        joined_question_no: 4,
    },
    question: {
        question_no: 4,
        question: 'Which planet is known as the Red Planet?',
        options: ['Earth', 'Mars', 'Venus', 'Mercury'],
        starts_at: '2026-02-28T18:01:00Z',
        ends_at: '2026-02-28T18:01:20Z',
        seconds_left: 11,
        answered: false,
    },
};

const lateJoinStandingsPayload = {
    phase: 'live',
    round: {
        ...roundMeta,
        status: 'live',
        phase: 'live',
        finalized_at: null,
        current_question_no: 4,
        countdown_seconds: 220,
    },
    total_participants: 12,
    rows: [
        {
            rank: 10,
            user_id: 999,
            username: 'KnightMoves',
            points: -40,
            correct: 0,
            wrong: 3,
            resolved: 3,
            progress: 3,
            total_answer_time_ms: 60000,
            accuracy: 0,
            joined_question_no: 1,
        },
        {
            rank: 11,
            user_id: 100,
            username: 'You',
            points: -45,
            correct: 0,
            wrong: 3,
            resolved: 3,
            progress: 3,
            total_answer_time_ms: 60000,
            accuracy: 0,
            joined_question_no: 4,
        },
        {
            rank: 12,
            user_id: 998,
            username: 'PawnStar',
            points: -50,
            correct: 0,
            wrong: 3,
            resolved: 3,
            progress: 3,
            total_answer_time_ms: 60000,
            accuracy: 0,
            joined_question_no: 1,
        },
    ],
    your_row: {
        rank: 11,
        user_id: 100,
        username: 'You',
        points: -45,
        correct: 0,
        wrong: 3,
        resolved: 3,
        progress: 3,
        total_answer_time_ms: 60000,
        accuracy: 0,
        joined_question_no: 4,
    },
};

test('quiz round finish shows popup then redirects to results and disables live tab', async ({ page }) => {
    let joinCalled = false;
    let stateAfterJoinCalls = 0;

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const method = request.method();

        if (!path.startsWith('/api/')) {
            await route.continue();
            return;
        }

        const fulfillJson = async (status, payload) => {
            await route.fulfill({
                status,
                headers: jsonHeaders,
                body: JSON.stringify(payload),
            });
        };

        if (path.endsWith('/api/accounts/refresh/') && method === 'POST') {
            await fulfillJson(401, { detail: 'Session expired. Please log in again.' });
            return;
        }

        if (path.endsWith('/api/games/digiquiz/state/') && method === 'GET') {
            if (!joinCalled) {
                await fulfillJson(200, buildState({
                    phase: 'join_open',
                    joined: false,
                    joinEnabled: true,
                    countdownSeconds: 600,
                }));
                return;
            }

            stateAfterJoinCalls += 1;
            if (stateAfterJoinCalls === 1) {
                await fulfillJson(200, buildState({
                    phase: 'live',
                    joined: true,
                    joinEnabled: true,
                    countdownSeconds: 360,
                }));
                return;
            }

            await fulfillJson(200, buildState({
                phase: 'results',
                joined: true,
                joinEnabled: false,
                countdownSeconds: 86399,
            }));
            return;
        }

        if (path.endsWith('/api/games/digiquiz/join/') && method === 'POST') {
            joinCalled = true;
            stateAfterJoinCalls = 0;
            await fulfillJson(201, {
                ...buildState({
                    phase: 'live',
                    joined: true,
                    joinEnabled: true,
                    countdownSeconds: 360,
                }),
                join: {
                    created: true,
                    phase: 'live',
                    participation_id: 501,
                    joined_question_no: 1,
                    points: 0,
                },
            });
            return;
        }

        if (path.endsWith('/api/games/digiquiz/live/question/') && method === 'GET') {
            if (stateAfterJoinCalls <= 1) {
                await fulfillJson(200, liveQuestionPayload);
                return;
            }
            await fulfillJson(200, {
                phase: 'results',
                round: resultsPayload.round,
                message: 'Round finished. Check results leaderboard.',
            });
            return;
        }

        if (path.endsWith('/api/games/digiquiz/live/standings/') && method === 'GET') {
            if (stateAfterJoinCalls <= 1) {
                await fulfillJson(200, standingsPayload);
                return;
            }
            await fulfillJson(200, {
                ...standingsPayload,
                phase: 'results',
                round: resultsPayload.round,
            });
            return;
        }

        if (path.endsWith('/api/games/digiquiz/results/') && method === 'GET') {
            await fulfillJson(200, resultsPayload);
            return;
        }

        if (path.endsWith('/api/notifications/unread-count/')) {
            await fulfillJson(200, { unread_count: 0 });
            return;
        }

        if (path.endsWith('/api/notifications/')) {
            await fulfillJson(200, { results: [], total: 0, page: 1, page_size: 10 });
            return;
        }

        if (path.endsWith('/api/games/public/')) {
            await fulfillJson(200, { results: [], total: 0 });
            return;
        }

        await fulfillJson(200, {});
    });

    await page.goto('/#/quiz');

    await expect(page.getByRole('heading', { name: /Next Quiz Starts at/i })).toBeVisible();

    const joinButton = page.getByRole('button', { name: 'Join Quiz' });
    await expect(joinButton).toBeEnabled();
    await joinButton.click();

    await expect(page.getByText(/Question 1\/20/i)).toBeVisible();

    const popupBody = page.getByText("Preparing today's results...");
    await expect(popupBody).toBeVisible({ timeout: 12000 });
    await expect(popupBody).toBeHidden({ timeout: 12000 });

    await expect(page.getByRole('heading', { name: 'DigiQuiz Leaderboard' })).toBeVisible();
    await expect(page.getByText('February 28, 2026')).toBeVisible();

    const liveTabButton = page.getByRole('button', { name: 'Live' });
    await expect(liveTabButton).toBeDisabled();

    await page.getByRole('button', { name: 'Upcoming' }).click();
    const upcomingSection = page.locator('section').filter({ hasText: 'Next Quiz Starts at 23:30 IST' }).first();
    await expect(upcomingSection).toBeVisible();
    await expect(upcomingSection.locator('.font-mono').first()).toHaveText('23');
});

test('late joiner gets in-progress flow and can leave/re-enter live page', async ({ page }) => {
    let joinCalled = false;

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const method = request.method();

        if (!path.startsWith('/api/')) {
            await route.continue();
            return;
        }

        const fulfillJson = async (status, payload) => {
            await route.fulfill({
                status,
                headers: jsonHeaders,
                body: JSON.stringify(payload),
            });
        };

        if (path.endsWith('/api/accounts/refresh/') && method === 'POST') {
            await fulfillJson(401, { detail: 'Session expired. Please log in again.' });
            return;
        }

        if (path.endsWith('/api/games/digiquiz/state/') && method === 'GET') {
            if (!joinCalled) {
                await fulfillJson(200, buildState({
                    phase: 'live',
                    joined: false,
                    joinEnabled: true,
                    countdownSeconds: 220,
                    currentQuestionNo: 4,
                }));
                return;
            }
            await fulfillJson(200, buildState({
                phase: 'live',
                joined: true,
                joinEnabled: true,
                countdownSeconds: 220,
                currentQuestionNo: 4,
                userPoints: -45,
                userRank: 11,
                userResolved: 3,
                participationId: 777,
            }));
            return;
        }

        if (path.endsWith('/api/games/digiquiz/join/') && method === 'POST') {
            joinCalled = true;
            await fulfillJson(201, {
                ...buildState({
                    phase: 'live',
                    joined: true,
                    joinEnabled: true,
                    countdownSeconds: 220,
                    currentQuestionNo: 4,
                    userPoints: -45,
                    userRank: 11,
                    userResolved: 3,
                    participationId: 777,
                }),
                join: {
                    created: true,
                    phase: 'live',
                    participation_id: 777,
                    joined_question_no: 4,
                    points: -45,
                },
            });
            return;
        }

        if (path.endsWith('/api/games/digiquiz/live/question/') && method === 'GET') {
            await fulfillJson(200, lateJoinLiveQuestionPayload);
            return;
        }

        if (path.endsWith('/api/games/digiquiz/live/standings/') && method === 'GET') {
            await fulfillJson(200, lateJoinStandingsPayload);
            return;
        }

        if (path.endsWith('/api/games/digiquiz/results/') && method === 'GET') {
            await fulfillJson(200, {
                round: null,
                total_participants: 0,
                total_pages: 0,
                page: 1,
                limit: 100,
                podium: [],
                rows: [],
                your_row: null,
            });
            return;
        }

        if (path.endsWith('/api/notifications/unread-count/')) {
            await fulfillJson(200, { unread_count: 0 });
            return;
        }

        if (path.endsWith('/api/notifications/')) {
            await fulfillJson(200, { results: [], total: 0, page: 1, page_size: 10 });
            return;
        }

        if (path.endsWith('/api/games/public/')) {
            await fulfillJson(200, { results: [], total: 0 });
            return;
        }

        await fulfillJson(200, {});
    });

    await page.goto('/#/quiz');

    const joinButton = page.getByRole('button', { name: 'Join Quiz' });
    await expect(joinButton).toBeEnabled();
    await joinButton.click();

    await expect(page.getByText(/Question 4\/20/i)).toBeVisible();
    await expect(page.getByText('Which planet is known as the Red Planet?')).toBeVisible();
    await expect(page.getByText('#11')).toBeVisible();
    await expect(page.getByText('-45').first()).toBeVisible();

    await page.getByRole('button', { name: 'Upcoming' }).click();
    const inProgressJoinButton = page.getByRole('button', { name: 'Quiz In Progress Join' });
    await expect(inProgressJoinButton).toBeVisible();
    await inProgressJoinButton.click();

    await expect(page.getByText(/Question 4\/20/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Live' })).toBeEnabled();
});

test('before join window, live is locked and join stays disabled', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const method = request.method();

        if (!path.startsWith('/api/')) {
            await route.continue();
            return;
        }

        const fulfillJson = async (status, payload) => {
            await route.fulfill({
                status,
                headers: jsonHeaders,
                body: JSON.stringify(payload),
            });
        };

        if (path.endsWith('/api/accounts/refresh/') && method === 'POST') {
            await fulfillJson(401, { detail: 'Session expired. Please log in again.' });
            return;
        }

        if (path.endsWith('/api/games/digiquiz/state/') && method === 'GET') {
            await fulfillJson(200, buildState({
                phase: 'upcoming',
                joined: false,
                joinEnabled: false,
                countdownSeconds: 1200,
                currentQuestionNo: 0,
            }));
            return;
        }

        if (path.endsWith('/api/games/digiquiz/results/') && method === 'GET') {
            await fulfillJson(200, {
                round: null,
                total_participants: 0,
                total_pages: 0,
                page: 1,
                limit: 100,
                podium: [],
                rows: [],
                your_row: null,
            });
            return;
        }

        if (path.endsWith('/api/games/digiquiz/live/standings/') && method === 'GET') {
            await fulfillJson(200, { rows: [], your_row: null, total_participants: 0, phase: 'upcoming' });
            return;
        }

        if (path.endsWith('/api/notifications/unread-count/')) {
            await fulfillJson(200, { unread_count: 0 });
            return;
        }

        if (path.endsWith('/api/notifications/')) {
            await fulfillJson(200, { results: [], total: 0, page: 1, page_size: 10 });
            return;
        }

        if (path.endsWith('/api/games/public/')) {
            await fulfillJson(200, { results: [], total: 0 });
            return;
        }

        await fulfillJson(200, {});
    });

    await page.goto('/#/quiz');

    await expect(page.getByRole('heading', { name: /Next Quiz Starts at/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Live' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Join Opens at 23:20 IST' })).toBeDisabled();
});
