# Tournament Hardening Suite

This adds runtime validation beyond unit tests for:
- multi-worker race/concurrency behavior
- Celery beat + worker lifecycle timing
- tournament load/soak behavior
- frontend live tournament E2E

## 1) Start Runtime Stack (2 backend instances + gateway + Celery + beat)

```powershell
cd digichess-backend
docker compose -f docker-compose.yml -f docker-compose.tournament.yml up -d --build
```

Gateway URL for stress/E2E API:
- `http://localhost:8010/api`

## 2) Seed Deterministic Users

```powershell
docker compose -f docker-compose.yml -f docker-compose.tournament.yml exec backend `
  python manage.py seed_test_users `
  --prefix harden --domain load.test --count 80 --password Pass1234! --include-creator
```

## 3) Verify Real Celery Beat Runtime Timing

```powershell
docker compose -f docker-compose.yml -f docker-compose.tournament.yml exec backend `
  python manage.py verify_tournament_runtime `
  --prefix harden_runtime --domain load.test --password Pass1234! `
  --start-delay-seconds 8 --timeout-seconds 120 --cleanup
```

What this verifies:
- pending tournament auto-starts when `start_at` is reached
- pairings are created automatically after start
- tournament auto-completes after games are finished

## 4) Run Concurrent Tournament Stress (All Formats)

```powershell
docker compose -f docker-compose.yml -f docker-compose.tournament.yml exec backend `
  python manage.py stress_tournaments `
  --base-url http://gateway:8080 --api-prefix /api `
  --prefix harden --domain load.test --password Pass1234! `
  --participants 16 --loops 3 --workers 16 `
  --formats arena,swiss,round_robin,knockout
```

Stress invariants checked:
- no player has more than one open game in the same tournament
- no duplicate pairings in the same round
- lifecycle progression remains consistent through completion

## 5) Load/Soak Testing (Locust)

Install Locust in backend container:

```powershell
docker compose -f docker-compose.yml -f docker-compose.tournament.yml exec backend `
  sh -lc "pip install -r requirements-load.txt"
```

Short probe:

```powershell
docker compose -f docker-compose.yml -f docker-compose.tournament.yml exec backend `
  sh -lc "locust -f load/locustfile_tournaments.py --host http://gateway:8080 --headless -u 50 -r 5 --run-time 3m --only-summary"
```

Long soak example:

```powershell
docker compose -f docker-compose.yml -f docker-compose.tournament.yml exec backend `
  sh -lc "locust -f load/locustfile_tournaments.py --host http://gateway:8080 --headless -u 150 -r 10 --run-time 2h --only-summary"
```

## 6) Frontend Live E2E (Playwright)

In frontend:

```powershell
cd ..\digichess-frontend
npm install
npx playwright install chromium
```

Set E2E users (from seeded users):

```powershell
$env:PLAYWRIGHT_BASE_URL="http://localhost:5173"
$env:E2E_API_BASE_URL="http://localhost:8010/api"
$env:E2E_CREATOR_USERNAME="harden_creator"
$env:E2E_CREATOR_PASSWORD="Pass1234!"
$env:E2E_PLAYER_USERNAME="harden_001"
$env:E2E_PLAYER_PASSWORD="Pass1234!"
```

Run:

```powershell
npm run e2e
```

## 7) One-Command Runner

PowerShell wrapper:

```powershell
cd ..\digichess-backend
.\scripts\run_tournament_hardening.ps1
```

Useful flags:
- `-StressLoops 5`
- `-Participants 32`
- `-SkipLoad`
- `-KeepUp`

## 8) Optional Pytest Integration Gate

When full stack is running:

```powershell
$env:RUN_TOURNAMENT_INTEGRATION="1"
$env:TOURNAMENT_STACK_BASE_URL="http://localhost:8010"
python -m pytest tests/integration/test_tournament_runtime.py -m integration -q
```
