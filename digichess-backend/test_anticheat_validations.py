"""
Comprehensive validation tests for the Anti-Cheat system.

Tests every backend validation:
 1. Game must exist
 2. Game must be finished (not active/pending)
 3. Reporter must be a player in the game
 4. Cannot report a bot
 5. No duplicate reports
 6. Must be authenticated to submit
 7. Non-admin cannot list/view/analyze/resolve/irwin
 8. Resolve as cheating saves Irwin training data
 9. Resolve as clean saves Irwin training data
10. Dismiss does NOT save Irwin training data
11. Training rejected with <100 labels

Usage:
    python test_anticheat_validations.py
"""

import json
import sys
import time
import requests

BASE = "http://localhost:8000/api"

PLAYER_A = {"username": "kasanaruomoi", "password": "Raj@2624"}
PLAYER_B = {"username": "blitzorddd", "password": "Raj@2624"}
ADMIN = {"username": "amenotiomoi", "password": "Raj@2624"}

passed = 0
failed = 0


def test(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name}  {detail}")


# This is a legacy helper for the standalone smoke script, not a pytest test.
test.__test__ = False


def login(username, password):
    r = requests.post(f"{BASE}/accounts/login/", json={"username": username, "password": password})
    if r.status_code != 200:
        return None
    data = r.json()
    return data.get("token") or data.get("access")


def h(token):
    return {"Authorization": f"Token {token}", "Content-Type": "application/json"}


def get_user_id(token, username):
    r = requests.get(f"{BASE}/public/accounts/{username}/", headers=h(token))
    return r.json().get("id") if r.status_code == 200 else None


def create_and_finish_game(token_a, token_b, id_b):
    """Create a game, accept, play Scholar's Mate, return game_id."""
    r = requests.post(f"{BASE}/games/", json={
        "opponent_id": id_b, "time_control": "blitz",
        "initial_time_seconds": 180, "increment_seconds": 0,
        "preferred_color": "white", "rated": False,
    }, headers=h(token_a))
    if r.status_code not in (200, 201):
        return None
    game = r.json()
    gid = game["id"]

    if game["white"]["username"] == PLAYER_A["username"]:
        tw, tb = token_a, token_b
    else:
        tw, tb = token_b, token_a

    requests.post(f"{BASE}/games/{gid}/accept/", headers=h(tb))
    time.sleep(0.3)

    for wm, bm in [("e4","e5"),("Bc4","Nc6"),("Qh5","Nf6"),("Qxf7",None)]:
        requests.post(f"{BASE}/games/{gid}/move/", json={"move": wm}, headers=h(tw))
        time.sleep(0.2)
        if bm:
            requests.post(f"{BASE}/games/{gid}/move/", json={"move": bm}, headers=h(tb))
            time.sleep(0.2)

    return gid


def create_active_game(token_a, token_b, id_b):
    """Create a game and accept it but don't play -- stays active."""
    r = requests.post(f"{BASE}/games/", json={
        "opponent_id": id_b, "time_control": "blitz",
        "initial_time_seconds": 180, "increment_seconds": 0,
        "preferred_color": "white", "rated": False,
    }, headers=h(token_a))
    if r.status_code not in (200, 201):
        return None
    game = r.json()
    gid = game["id"]

    if game["white"]["username"] == PLAYER_A["username"]:
        tb = token_b
    else:
        tb = token_a

    requests.post(f"{BASE}/games/{gid}/accept/", headers=h(tb))
    time.sleep(0.2)
    requests.post(f"{BASE}/games/{gid}/move/", json={"move": "e4"}, headers=h(token_a))
    time.sleep(0.2)
    return gid


def main():
    print("=" * 60)
    print("ANTI-CHEAT VALIDATION TESTS")
    print("=" * 60)

    # Login
    print("\n[Setup] Logging in...")
    token_a = login(PLAYER_A["username"], PLAYER_A["password"])
    token_b = login(PLAYER_B["username"], PLAYER_B["password"])
    token_admin = login(ADMIN["username"], ADMIN["password"])

    if not all([token_a, token_b, token_admin]):
        print("ABORT: Could not login all users.")
        sys.exit(1)

    id_a = get_user_id(token_a, PLAYER_A["username"])
    id_b = get_user_id(token_a, PLAYER_B["username"])
    print(f"  Players: A={PLAYER_A['username']}(id={id_a}), B={PLAYER_B['username']}(id={id_b})")

    # Get a bot for bot test
    bot_r = requests.get(f"{BASE}/games/bots/", headers=h(token_a))
    bot_data = bot_r.json() if bot_r.status_code == 200 else {}
    bots = []
    if isinstance(bot_data, list):
        bots = bot_data
    elif isinstance(bot_data, dict):
        for tier_list in bot_data.values():
            if isinstance(tier_list, list):
                bots.extend(tier_list)
    bot_id = bots[0].get("id") if bots else None
    if bot_id:
        print(f"  Bot found: id={bot_id}")
    else:
        print("  No bots found")

    # Create a finished game for valid reports
    print("\n[Setup] Creating finished game...")
    finished_game_id = create_and_finish_game(token_a, token_b, id_b)
    print(f"  Finished game: #{finished_game_id}")

    # Create another finished game for extra tests
    finished_game2_id = create_and_finish_game(token_a, token_b, id_b)
    print(f"  Finished game 2: #{finished_game2_id}")

    # Create a third finished game for dismiss test
    finished_game3_id = create_and_finish_game(token_a, token_b, id_b)
    print(f"  Finished game 3: #{finished_game3_id}")

    # ============================================================
    # REPORT CREATION VALIDATIONS
    # ============================================================
    print("\n" + "=" * 60)
    print("REPORT CREATION VALIDATIONS")
    print("=" * 60)

    # 1. Game must exist
    print("\n[V1] Non-existent game ID...")
    r = requests.post(f"{BASE}/games/anticheat/reports/", json={
        "game": 999999, "reason": "engine_use", "description": "test"
    }, headers=h(token_a))
    test("Non-existent game rejected", r.status_code == 400, f"got {r.status_code}: {r.text[:100]}")

    # 2. Game must be finished
    print("\n[V2] Active (unfinished) game...")
    active_gid = create_active_game(token_a, token_b, id_b)
    if active_gid:
        r = requests.post(f"{BASE}/games/anticheat/reports/", json={
            "game": active_gid, "reason": "engine_use", "description": "test"
        }, headers=h(token_a))
        test("Active game rejected", r.status_code == 400, f"got {r.status_code}: {r.text[:150]}")
        # Clean up: abort the active game
        requests.post(f"{BASE}/games/{active_gid}/abort/", headers=h(token_a))
    else:
        test("Active game rejected", False, "Could not create active game")

    # 3. Reporter must be a player in the game
    print("\n[V3] Non-participant reporting...")
    r = requests.post(f"{BASE}/games/anticheat/reports/", json={
        "game": finished_game_id, "reason": "engine_use", "description": "test"
    }, headers=h(token_admin))
    test("Non-participant rejected", r.status_code == 400, f"got {r.status_code}: {r.text[:150]}")
    test("Error says 'only report your opponent'", "opponent" in r.text.lower(), r.text[:150])

    # 4. Cannot report a bot
    print("\n[V4] Reporting a bot game...")
    if bot_id:
        # Create a bot game
        br = requests.post(f"{BASE}/games/bots/create-game/", json={
            "bot_id": bot_id, "time_control": "blitz",
            "initial_time_seconds": 180, "increment_seconds": 0,
        }, headers=h(token_a))
        if br.status_code in (200, 201):
            bot_game = br.json()
            bot_game_id = bot_game.get("id") or bot_game.get("game", {}).get("id")
            if bot_game_id:
                # Need to finish the bot game first -- resign
                time.sleep(1)
                requests.post(f"{BASE}/games/{bot_game_id}/resign/", headers=h(token_a))
                time.sleep(0.5)

                r = requests.post(f"{BASE}/games/anticheat/reports/", json={
                    "game": bot_game_id, "reason": "engine_use", "description": "testing bot report"
                }, headers=h(token_a))
                test("Bot game report rejected", r.status_code == 400, f"got {r.status_code}: {r.text[:150]}")
                test("Error says 'Cannot report a bot'", "bot" in r.text.lower(), r.text[:150])
            else:
                test("Bot game report rejected", False, "Could not get bot game ID")
        else:
            test("Bot game report rejected", False, f"Could not create bot game: {br.status_code}")
    else:
        print("  SKIP: No bots found in system")

    # 5. Duplicate report prevention
    print("\n[V5] Duplicate report...")
    r1 = requests.post(f"{BASE}/games/anticheat/reports/", json={
        "game": finished_game_id, "reason": "engine_use", "description": "first report"
    }, headers=h(token_b))
    report_id_1 = r1.json().get("id") if r1.status_code in (200, 201) else None

    r2 = requests.post(f"{BASE}/games/anticheat/reports/", json={
        "game": finished_game_id, "reason": "engine_use", "description": "duplicate"
    }, headers=h(token_b))
    test("Duplicate report rejected", r2.status_code == 400, f"got {r2.status_code}: {r2.text[:150]}")
    test("Error says 'already reported'", "already" in r2.text.lower(), r2.text[:150])

    # 6. Must be authenticated
    print("\n[V6] Unauthenticated report...")
    r = requests.post(f"{BASE}/games/anticheat/reports/", json={
        "game": finished_game2_id, "reason": "engine_use", "description": "no auth"
    })
    test("Unauthenticated rejected", r.status_code in (401, 403), f"got {r.status_code}")

    # ============================================================
    # ADMIN ENDPOINT ACCESS CONTROL
    # ============================================================
    print("\n" + "=" * 60)
    print("ADMIN ENDPOINT ACCESS CONTROL")
    print("=" * 60)

    # Regular user trying admin endpoints
    print("\n[V7] Non-admin accessing admin endpoints...")

    r = requests.get(f"{BASE}/games/anticheat/reports/", headers=h(token_a))
    test("Non-admin cannot list reports", r.status_code == 403, f"got {r.status_code}")

    if report_id_1:
        r = requests.get(f"{BASE}/games/anticheat/reports/{report_id_1}/", headers=h(token_a))
        test("Non-admin cannot view report detail", r.status_code == 403, f"got {r.status_code}")

        r = requests.post(f"{BASE}/games/anticheat/reports/{report_id_1}/analyze/", headers=h(token_a))
        test("Non-admin cannot run analysis", r.status_code == 403, f"got {r.status_code}")

        r = requests.post(f"{BASE}/games/anticheat/reports/{report_id_1}/resolve/", json={
            "resolution": "resolved_clean"
        }, headers=h(token_a))
        test("Non-admin cannot resolve report", r.status_code == 403, f"got {r.status_code}")

    r = requests.get(f"{BASE}/games/anticheat/irwin/status/", headers=h(token_a))
    test("Non-admin cannot view Irwin status", r.status_code == 403, f"got {r.status_code}")

    r = requests.post(f"{BASE}/games/anticheat/irwin/train/", headers=h(token_a))
    test("Non-admin cannot train Irwin", r.status_code == 403, f"got {r.status_code}")

    # Unauthenticated trying admin endpoints
    print("\n[V8] Unauthenticated accessing admin endpoints...")
    r = requests.get(f"{BASE}/games/anticheat/reports/")
    test("Unauth cannot list reports", r.status_code in (401, 403), f"got {r.status_code}")

    r = requests.get(f"{BASE}/games/anticheat/irwin/status/")
    test("Unauth cannot view Irwin status", r.status_code in (401, 403), f"got {r.status_code}")

    # Admin CAN access
    print("\n[V9] Admin accessing admin endpoints...")
    r = requests.get(f"{BASE}/games/anticheat/reports/", headers=h(token_admin))
    test("Admin can list reports", r.status_code == 200, f"got {r.status_code}")

    r = requests.get(f"{BASE}/games/anticheat/irwin/status/", headers=h(token_admin))
    test("Admin can view Irwin status", r.status_code == 200, f"got {r.status_code}")

    # ============================================================
    # ANALYSIS + RESOLVE + IRWIN TRAINING DATA
    # ============================================================
    print("\n" + "=" * 60)
    print("ANALYSIS, RESOLVE & IRWIN TRAINING DATA")
    print("=" * 60)

    # Get initial Irwin count
    irwin_before = requests.get(f"{BASE}/games/anticheat/irwin/status/", headers=h(token_admin)).json()
    labels_before = irwin_before["labeled_count"]
    cheating_before = irwin_before["cheating_count"]
    clean_before = irwin_before["clean_count"]
    print(f"  Irwin before: labels={labels_before}, cheating={cheating_before}, clean={clean_before}")

    # Submit report on game 2 (for resolve as cheating)
    print("\n[V10] Report + analyze + resolve as CHEATING...")
    r = requests.post(f"{BASE}/games/anticheat/reports/", json={
        "game": finished_game2_id, "reason": "engine_use", "description": "testing cheating resolve"
    }, headers=h(token_b))
    report_id_2 = r.json().get("id") if r.status_code in (200, 201) else None
    test("Report 2 created", report_id_2 is not None, f"status={r.status_code}")

    if report_id_2:
        # Run analysis
        r = requests.post(f"{BASE}/games/anticheat/reports/{report_id_2}/analyze/", headers=h(token_admin), timeout=120)
        test("Analysis completed", r.status_code == 200, f"got {r.status_code}: {r.text[:150]}")

        # Resolve as cheating
        r = requests.post(f"{BASE}/games/anticheat/reports/{report_id_2}/resolve/", json={
            "resolution": "resolved_cheating", "admin_notes": "Test: marked as cheating"
        }, headers=h(token_admin))
        test("Resolved as cheating", r.status_code == 200, f"got {r.status_code}")

        # Check Irwin data increased
        irwin_after = requests.get(f"{BASE}/games/anticheat/irwin/status/", headers=h(token_admin)).json()
        test("Irwin cheating count increased", irwin_after["cheating_count"] > cheating_before,
             f"before={cheating_before}, after={irwin_after['cheating_count']}")
        test("Irwin label count increased", irwin_after["labeled_count"] > labels_before,
             f"before={labels_before}, after={irwin_after['labeled_count']}")

    # Submit report on game 3 (for resolve as clean)
    print("\n[V11] Report + analyze + resolve as CLEAN...")
    r = requests.post(f"{BASE}/games/anticheat/reports/", json={
        "game": finished_game3_id, "reason": "suspicious_play", "description": "testing clean resolve"
    }, headers=h(token_b))
    report_id_3 = r.json().get("id") if r.status_code in (200, 201) else None
    test("Report 3 created", report_id_3 is not None, f"status={r.status_code}")

    if report_id_3:
        r = requests.post(f"{BASE}/games/anticheat/reports/{report_id_3}/analyze/", headers=h(token_admin), timeout=120)
        test("Analysis 3 completed", r.status_code == 200, f"got {r.status_code}")

        irwin_mid = requests.get(f"{BASE}/games/anticheat/irwin/status/", headers=h(token_admin)).json()
        clean_mid = irwin_mid["clean_count"]

        r = requests.post(f"{BASE}/games/anticheat/reports/{report_id_3}/resolve/", json={
            "resolution": "resolved_clean", "admin_notes": "Test: marked as clean"
        }, headers=h(token_admin))
        test("Resolved as clean", r.status_code == 200, f"got {r.status_code}")

        irwin_after_clean = requests.get(f"{BASE}/games/anticheat/irwin/status/", headers=h(token_admin)).json()
        test("Irwin clean count increased", irwin_after_clean["clean_count"] > clean_mid,
             f"before={clean_mid}, after={irwin_after_clean['clean_count']}")

    # Test DISMISS does NOT add training data
    print("\n[V12] Report + analyze + DISMISS (no training data)...")
    game4_id = create_and_finish_game(token_a, token_b, id_b)
    if game4_id:
        r = requests.post(f"{BASE}/games/anticheat/reports/", json={
            "game": game4_id, "reason": "engine_use", "description": "testing dismiss"
        }, headers=h(token_b))
        report_id_4 = r.json().get("id") if r.status_code in (200, 201) else None

        if report_id_4:
            requests.post(f"{BASE}/games/anticheat/reports/{report_id_4}/analyze/", headers=h(token_admin), timeout=120)

            irwin_before_dismiss = requests.get(f"{BASE}/games/anticheat/irwin/status/", headers=h(token_admin)).json()
            labels_bd = irwin_before_dismiss["labeled_count"]

            r = requests.post(f"{BASE}/games/anticheat/reports/{report_id_4}/resolve/", json={
                "resolution": "dismissed", "admin_notes": "Test: dismissed"
            }, headers=h(token_admin))
            test("Resolved as dismissed", r.status_code == 200, f"got {r.status_code}")

            irwin_after_dismiss = requests.get(f"{BASE}/games/anticheat/irwin/status/", headers=h(token_admin)).json()
            test("Dismiss did NOT add training data", irwin_after_dismiss["labeled_count"] == labels_bd,
                 f"before={labels_bd}, after={irwin_after_dismiss['labeled_count']}")

    # ============================================================
    # IRWIN TRAINING THRESHOLD
    # ============================================================
    print("\n" + "=" * 60)
    print("IRWIN TRAINING THRESHOLD")
    print("=" * 60)

    print("\n[V13] Training with insufficient data...")
    r = requests.post(f"{BASE}/games/anticheat/irwin/train/", json={"epochs": 5}, headers=h(token_admin))
    test("Training rejected (<100 labels)", r.status_code == 400, f"got {r.status_code}")
    test("Error mentions threshold", "100" in r.text or "Need" in r.text, r.text[:150])

    # ============================================================
    # REPORT STATUS FILTER
    # ============================================================
    print("\n" + "=" * 60)
    print("REPORT STATUS FILTERING")
    print("=" * 60)

    r_all = requests.get(f"{BASE}/games/anticheat/reports/", headers=h(token_admin))
    r_pending = requests.get(f"{BASE}/games/anticheat/reports/?status=pending", headers=h(token_admin))
    r_cheating = requests.get(f"{BASE}/games/anticheat/reports/?status=resolved_cheating", headers=h(token_admin))
    r_clean = requests.get(f"{BASE}/games/anticheat/reports/?status=resolved_clean", headers=h(token_admin))
    r_dismissed = requests.get(f"{BASE}/games/anticheat/reports/?status=dismissed", headers=h(token_admin))

    all_count = len(r_all.json())
    pending_count = len(r_pending.json())
    cheating_count = len(r_cheating.json())
    clean_count = len(r_clean.json())
    dismissed_count = len(r_dismissed.json())

    test("All reports returned", all_count > 0, f"count={all_count}")
    test("Pending filter works", pending_count <= all_count, f"pending={pending_count}, all={all_count}")
    test("Cheating filter works", cheating_count > 0, f"cheating={cheating_count}")
    test("Clean filter works", clean_count > 0, f"clean={clean_count}")
    test("Dismissed filter works", dismissed_count > 0, f"dismissed={dismissed_count}")
    test("Filters sum correctly", pending_count + cheating_count + clean_count + dismissed_count <= all_count + 5,
         f"sum check: {pending_count}+{cheating_count}+{clean_count}+{dismissed_count} vs {all_count}")

    # ============================================================
    # SUMMARY
    # ============================================================
    print("\n" + "=" * 60)
    irwin_final = requests.get(f"{BASE}/games/anticheat/irwin/status/", headers=h(token_admin)).json()
    print(f"FINAL IRWIN STATUS: labels={irwin_final['labeled_count']}, cheating={irwin_final['cheating_count']}, clean={irwin_final['clean_count']}, trained={irwin_final['is_trained']}")
    print("=" * 60)
    print(f"\nRESULTS: {passed} passed, {failed} failed, {passed + failed} total")
    if failed > 0:
        print("SOME TESTS FAILED!")
        sys.exit(1)
    else:
        print("ALL TESTS PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    main()
