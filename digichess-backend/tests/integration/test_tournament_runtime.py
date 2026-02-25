import os

import pytest
from django.core.management import call_command


pytestmark = pytest.mark.integration


def _integration_enabled():
    return os.getenv("RUN_TOURNAMENT_INTEGRATION") == "1"


@pytest.mark.skipif(
    not _integration_enabled(),
    reason="Set RUN_TOURNAMENT_INTEGRATION=1 with a running stack to execute integration tests.",
)
@pytest.mark.django_db(transaction=True)
def test_verify_tournament_runtime_command():
    call_command(
        "verify_tournament_runtime",
        prefix="itest_runtime",
        domain="load.test",
        password="Pass1234!",
        start_delay_seconds=6,
        timeout_seconds=120,
        poll_seconds=1.0,
        cleanup=True,
    )


@pytest.mark.skipif(
    not _integration_enabled() or not os.getenv("TOURNAMENT_STACK_BASE_URL"),
    reason="Set RUN_TOURNAMENT_INTEGRATION=1 and TOURNAMENT_STACK_BASE_URL to execute stress integration tests.",
)
@pytest.mark.django_db(transaction=True)
def test_stress_tournaments_command():
    call_command(
        "seed_test_users",
        prefix="itest_stress",
        domain="load.test",
        count=20,
        password="Pass1234!",
        include_creator=True,
    )
    call_command(
        "stress_tournaments",
        base_url=os.getenv("TOURNAMENT_STACK_BASE_URL"),
        api_prefix=os.getenv("TOURNAMENT_STACK_API_PREFIX", "/api"),
        prefix="itest_stress",
        domain="load.test",
        password="Pass1234!",
        participants=12,
        loops=1,
        workers=12,
        formats="arena,swiss,round_robin,knockout",
        request_timeout=15.0,
        progress_steps=8,
        arena_cycles=3,
    )
