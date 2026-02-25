param(
    [int]$StressLoops = 2,
    [int]$Participants = 16,
    [int]$Users = 80,
    [switch]$SkipLoad,
    [switch]$KeepUp
)

$ErrorActionPreference = "Stop"

$compose = @("-f", "docker-compose.yml", "-f", "docker-compose.tournament.yml")

function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)
    & docker compose @compose @Args
}

Write-Host "Starting tournament runtime stack (postgres + redis + 2x backend + celery + beat + gateway) ..."
Invoke-Compose up -d --build

try {
    Write-Host "Seeding deterministic test users ..."
    Invoke-Compose exec backend python manage.py seed_test_users `
        --prefix harden `
        --domain load.test `
        --count $Users `
        --password Pass1234! `
        --include-creator

    Write-Host "Running Celery beat runtime verification ..."
    Invoke-Compose exec backend python manage.py verify_tournament_runtime `
        --prefix harden_runtime `
        --domain load.test `
        --password Pass1234! `
        --start-delay-seconds 8 `
        --timeout-seconds 120 `
        --poll-seconds 1.0 `
        --cleanup

    Write-Host "Running concurrent tournament API stress checks ..."
    Invoke-Compose exec backend python manage.py stress_tournaments `
        --base-url http://gateway:8080 `
        --api-prefix /api `
        --prefix harden `
        --domain load.test `
        --password Pass1234! `
        --participants $Participants `
        --loops $StressLoops `
        --workers 16 `
        --formats arena,swiss,round_robin,knockout `
        --request-timeout 15 `
        --progress-steps 10 `
        --arena-cycles 4

    if (-not $SkipLoad) {
        Write-Host "Installing load dependencies and running 3-minute tournament load probe ..."
        Invoke-Compose exec backend sh -lc "pip install -q -r requirements-load.txt"
        Invoke-Compose exec backend sh -lc "locust -f load/locustfile_tournaments.py --host http://gateway:8080 --headless -u 50 -r 5 --run-time 3m --only-summary"
    }

    Write-Host "Tournament hardening suite completed successfully."
}
finally {
    if (-not $KeepUp) {
        Write-Host "Stopping stack ..."
        Invoke-Compose down
    } else {
        Write-Host "Stack is still running because -KeepUp was set."
    }
}
