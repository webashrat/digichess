"""
End-to-end test for the Anti-Cheat reporting flow.

Tests:
1. Login as two players (kasanaruomoi, blitzorddd)
2. Create a game, play moves, finish it
3. Report the game from one player
4. Login as admin (amenotiomoi), view reports
5. Run cheat analysis on the report
6. Resolve report as cheating / clean
7. Verify Irwin training data was saved
8. Attempt Irwin training (will fail if <100 labels, but tests the endpoint)

Usage:
    python test_anticheat_flow.py
"""

import json
import sys
import time
import requests

BASE = "http://localhost:8000/api"

PLAYER_A = {"username": "kasanaruomoi", "password": "Raj@2624"}
PLAYER_B = {"username": "blitzorddd", "password": "Raj@2624"}
ADMIN = {"username": "amenotiomoi", "password": "Raj@2624"}


def login(username, password):
    r = requests.post(f"{BASE}/accounts/login/", json={"username": username, "password": password})
    if r.status_code != 200:
        print(f"  FAIL login {username}: {r.status_code} {r.text[:200]}")
        return None
    data = r.json()
    token = data.get("token") or data.get("access")
    print(f"  OK login {username} -> token={token[:20]}...")
    return token


def headers(token):
    return {"Authorization": f"Token {token}", "Content-Type": "application/json"}


def create_game(token_creator, opponent_id):
    r = requests.post(f"{BASE}/games/", json={
        "opponent_id": opponent_id,
        "time_control": "blitz",
        "initial_time_seconds": 180,
        "increment_seconds": 0,
        "preferred_color": "white",
        "rated": False,
    }, headers=headers(token_creator))
    if r.status_code not in (200, 201):
        print(f"  FAIL create game: {r.status_code} {r.text[:300]}")
        return None
    game = r.json()
    print(f"  OK created game #{game['id']} ({game['white']['username']} vs {game['black']['username']})")
    return game


def accept_game(token, game_id):
    r = requests.post(f"{BASE}/games/{game_id}/accept/", headers=headers(token))
    if r.status_code != 200:
        print(f"  FAIL accept game: {r.status_code} {r.text[:200]}")
        return False
    print(f"  OK accepted game #{game_id}")
    return True


def make_move(token, game_id, move):
    r = requests.post(f"{BASE}/games/{game_id}/move/", json={"move": move}, headers=headers(token))
    if r.status_code != 200:
        print(f"  FAIL move {move}: {r.status_code} {r.text[:200]}")
        return False
    return True


def resign_game(token, game_id):
    r = requests.post(f"{BASE}/games/{game_id}/resign/", headers=headers(token))
    if r.status_code != 200:
        print(f"  FAIL resign: {r.status_code} {r.text[:200]}")
        return False
    print(f"  OK resigned game #{game_id}")
    return True


def get_game(token, game_id):
    r = requests.get(f"{BASE}/games/{game_id}/", headers=headers(token))
    return r.json() if r.status_code == 200 else None


def get_user_id(token, username):
    r = requests.get(f"{BASE}/public/accounts/{username}/", headers=headers(token))
    if r.status_code == 200:
        return r.json().get("id")
    return None


def submit_report(token, game_id, reason="engine_use", description="Test report"):
    r = requests.post(f"{BASE}/games/anticheat/reports/", json={
        "game": game_id,
        "reason": reason,
        "description": description,
    }, headers=headers(token))
    if r.status_code not in (200, 201):
        print(f"  FAIL submit report: {r.status_code} {r.text[:300]}")
        return None
    report = r.json()
    print(f"  OK report #{report['id']} created (reporter={report['reporter']['username']}, reported={report['reported_user']['username']})")
    return report


def list_reports(token, status_filter=""):
    url = f"{BASE}/games/anticheat/reports/"
    if status_filter:
        url += f"?status={status_filter}"
    r = requests.get(url, headers=headers(token))
    if r.status_code != 200:
        print(f"  FAIL list reports: {r.status_code} {r.text[:200]}")
        return []
    reports = r.json()
    print(f"  OK fetched {len(reports)} reports")
    return reports


def get_report_detail(token, report_id):
    r = requests.get(f"{BASE}/games/anticheat/reports/{report_id}/", headers=headers(token))
    if r.status_code != 200:
        print(f"  FAIL get report: {r.status_code} {r.text[:200]}")
        return None
    return r.json()


def run_analysis(token, report_id):
    print(f"  Running analysis on report #{report_id} (this may take a minute)...")
    r = requests.post(f"{BASE}/games/anticheat/reports/{report_id}/analyze/", headers=headers(token), timeout=300)
    if r.status_code != 200:
        print(f"  FAIL analysis: {r.status_code} {r.text[:300]}")
        return None
    analysis = r.json()
    print(f"  OK analysis complete: verdict={analysis.get('verdict')}, T1={analysis.get('t1_pct')}%, ACPL={analysis.get('avg_centipawn_loss')}")
    return analysis


def resolve_report(token, report_id, resolution, notes=""):
    r = requests.post(f"{BASE}/games/anticheat/reports/{report_id}/resolve/", json={
        "resolution": resolution,
        "admin_notes": notes,
    }, headers=headers(token))
    if r.status_code != 200:
        print(f"  FAIL resolve: {r.status_code} {r.text[:300]}")
        return None
    report = r.json()
    print(f"  OK resolved report #{report_id} as {resolution}")
    return report


def get_irwin_status(token):
    r = requests.get(f"{BASE}/games/anticheat/irwin/status/", headers=headers(token))
    if r.status_code != 200:
        print(f"  FAIL irwin status: {r.status_code} {r.text[:200]}")
        return None
    data = r.json()
    print(f"  OK Irwin status: labeled={data['labeled_count']}, cheating={data['cheating_count']}, clean={data['clean_count']}, trained={data['is_trained']}")
    return data


def train_irwin(token):
    r = requests.post(f"{BASE}/games/anticheat/irwin/train/", json={"epochs": 5}, headers=headers(token), timeout=300)
    if r.status_code != 200:
        print(f"  Irwin training response: {r.status_code} {r.text[:300]}")
        return None
    return r.json()


SCHOLAR_MATE_MOVES = [
    ("e4", "e5"),
    ("Bc4", "Nc6"),
    ("Qh5", "Nf6"),
    ("Qxf7", None),
]


def play_short_game(token_white, token_black, game_id):
    """Play a Scholar's mate (4-move checkmate)."""
    for i, (w_move, b_move) in enumerate(SCHOLAR_MATE_MOVES):
        if not make_move(token_white, game_id, w_move):
            return False
        time.sleep(0.3)
        if b_move:
            if not make_move(token_black, game_id, b_move):
                return False
            time.sleep(0.3)
    return True


def play_longer_game(token_white, token_black, game_id):
    """Play ~20 moves using UCI notation to avoid SAN ambiguity, then resign."""
    moves_uci = [
        ("e2e4","e7e5"), ("g1f3","b8c6"), ("f1b5","a7a6"),
        ("b5a4","g8f6"), ("e1g1","f8e7"), ("f1e1","b7b5"),
        ("a4b3","d7d6"), ("c2c3","e8g8"), ("h2h3","c6b8"),
        ("d2d4","b8d7"), ("b1d2","c8b7"), ("b3c2","f8e8"),
        ("d2f1","e7f8"), ("f1g3","g7g6"), ("a2a4","c7c5"),
        ("d4d5","c5c4"), ("c1g5","d7c5"), ("g3h5","g6h5"),
        ("g5f6","d8f6"), ("d1d2","f6g6"),
    ]
    for w, b in moves_uci:
        if not make_move(token_white, game_id, w):
            print(f"    Failed at white: {w}")
            resign_game(token_white, game_id)
            return True
        time.sleep(0.1)
        if not make_move(token_black, game_id, b):
            print(f"    Failed at black: {b}")
            resign_game(token_white, game_id)
            return True
        time.sleep(0.1)
    resign_game(token_white, game_id)
    return True


def play_long_game(token_white, token_black, game_id):
    """Play a 60+ move game using UCI notation. Italian Game into long middlegame/endgame."""
    moves_uci = [
        ("e2e4","e7e5"), ("g1f3","b8c6"), ("f1c4","f8c5"),
        ("c2c3","g8f6"), ("d2d4","e5d4"), ("c3d4","c5b4"),
        ("b1c3","f6e4"), ("e1g1","e4c3"), ("b2c3","b4c3"),
        ("c1a3","d7d5"), ("c4b3","c3a5"), ("d1e2","c8e6"),
        ("f3e5","a5b6"), ("e5c6","b7c6"), ("f1e1","e8g8"),
        ("a3c5","b6c5"), ("d4c5","d8d7"), ("e2f3","a8b8"),
        ("a1c1","f8e8"), ("f3g3","g8h8"), ("b3a4","d7c8"),
        ("g3d6","e6f5"), ("d6d4","f7f6"), ("a4c6","e8e1"),
        ("c1e1","b8b2"), ("d4d5","f5e4"), ("d5e4","b2a2"),
        ("c6d7","c8d7"), ("e4e7","d7d1"), ("e1d1","a2c2"),
        ("d1d8","h8g7"), ("e7d6","c2c5"), ("d6d4","a7a5"),
        ("d8a8","c5c1"), ("g1f2","c1c2"), ("f2g3","a5a4"),
        ("a8a4","c2a2"), ("a4a7","g7f8"), ("d4d8","f8e7"),
        ("d8c7","e7f8"), ("a7a8","f8g7"), ("c7d6","a2d2"),
        ("d6c7","d2d7"), ("c7e5","d7d5"), ("e5e7","g7h6"),
        ("a8a6","d5f5"), ("g3g4","f5f1"), ("e7f6","f1g1"),
        ("g4h3","g1h1"), ("h3g3","h1g1"), ("g3f2","g1a1"),
        ("f6g5","h6g7"), ("a6a1","h7h5"), ("g5f4","g7f6"),
        ("a1a6","f6e7"), ("f4g5","e7d7"), ("a6a7","d7c6"),
        ("g5f5","c6b6"), ("a7a2","b6c7"), ("f5e5","c7d7"),
        ("a2a7","d7e8"), ("e5f6","e8f8"), ("a7a8","f8g7"),
    ]
    for w, b in moves_uci:
        if not make_move(token_white, game_id, w):
            print(f"    Failed at white: {w}")
            resign_game(token_white, game_id)
            return True
        time.sleep(0.08)
        if not make_move(token_black, game_id, b):
            print(f"    Failed at black: {b}")
            resign_game(token_white, game_id)
            return True
        time.sleep(0.08)
    resign_game(token_white, game_id)
    return True


def main():
    print("=" * 60)
    print("ANTI-CHEAT END-TO-END TEST")
    print("=" * 60)

    # --- Step 1: Login ---
    print("\n[1] Logging in players...")
    token_a = login(PLAYER_A["username"], PLAYER_A["password"])
    token_b = login(PLAYER_B["username"], PLAYER_B["password"])
    token_admin = login(ADMIN["username"], ADMIN["password"])

    if not all([token_a, token_b, token_admin]):
        print("ABORT: Could not login all users.")
        sys.exit(1)

    # Get user IDs
    id_a = get_user_id(token_a, PLAYER_A["username"])
    id_b = get_user_id(token_a, PLAYER_B["username"])
    print(f"  Player A ({PLAYER_A['username']}) id={id_a}")
    print(f"  Player B ({PLAYER_B['username']}) id={id_b}")

    if not id_a or not id_b:
        print("ABORT: Could not get user IDs.")
        sys.exit(1)

    # --- Step 2: Play Game 1 (short, Scholar's Mate) ---
    print("\n[2] Creating & playing Game 1 (Scholar's Mate)...")
    game1 = create_game(token_a, id_b)
    if not game1:
        sys.exit(1)
    game1_id = game1["id"]

    # Determine who is white/black
    if game1["white"]["username"] == PLAYER_A["username"]:
        tw, tb = token_a, token_b
    else:
        tw, tb = token_b, token_a

    accept_game(tb, game1_id)
    time.sleep(0.5)

    if play_short_game(tw, tb, game1_id):
        g = get_game(token_a, game1_id)
        print(f"  Game 1 result: {g['result']}, status: {g['status']}, moves: {g.get('move_count', '?')}")
    else:
        print("  WARN: Game 1 may not have completed properly")

    # --- Step 3: Play Game 2 (longer, resign) ---
    print("\n[3] Creating & playing Game 2 (longer game, resign)...")
    game2 = create_game(token_a, id_b)
    if not game2:
        sys.exit(1)
    game2_id = game2["id"]

    if game2["white"]["username"] == PLAYER_A["username"]:
        tw2, tb2 = token_a, token_b
    else:
        tw2, tb2 = token_b, token_a

    accept_game(tb2, game2_id)
    time.sleep(0.5)

    if play_longer_game(tw2, tb2, game2_id):
        g2 = get_game(token_a, game2_id)
        print(f"  Game 2 result: {g2['result']}, status: {g2['status']}, moves: {g2.get('move_count', '?')}")

    # --- Step 3b: Play Game 3 (60+ moves) ---
    print("\n[3b] Creating & playing Game 3 (60+ move game)...")
    game3 = create_game(token_a, id_b)
    if not game3:
        sys.exit(1)
    game3_id = game3["id"]

    if game3["white"]["username"] == PLAYER_A["username"]:
        tw3, tb3 = token_a, token_b
    else:
        tw3, tb3 = token_b, token_a

    accept_game(tb3, game3_id)
    time.sleep(0.5)

    if play_long_game(tw3, tb3, game3_id):
        g3 = get_game(token_a, game3_id)
        print(f"  Game 3 result: {g3['result']}, status: {g3['status']}, moves: {g3.get('move_count', '?')}")

    # --- Step 4: Submit reports ---
    print("\n[4] Submitting cheat reports...")
    report1 = submit_report(token_b, game1_id, "engine_use", "White played a perfect Scholar's Mate very quickly, suspicious.")
    report2 = submit_report(token_b, game2_id, "suspicious_play", "Opponent played opening theory perfectly then resigned, possibly testing engine.")
    report3 = submit_report(token_b, game3_id, "engine_use", "Opponent played 60+ moves with engine-like precision throughout the game.")

    # Test duplicate prevention
    print("  Testing duplicate report prevention...")
    dup = submit_report(token_b, game1_id, "engine_use", "duplicate test")
    if dup is None:
        print("  OK duplicate report correctly rejected")

    # Test reporter must be a player
    print("  Testing non-player report prevention...")
    bad_report = submit_report(token_admin, game1_id, "engine_use", "admin trying to report")
    if bad_report is None:
        print("  OK non-player report correctly rejected")

    # --- Step 5: Admin views reports ---
    print("\n[5] Admin viewing reports...")
    all_reports = list_reports(token_admin)
    pending = list_reports(token_admin, "pending")

    if report1:
        detail = get_report_detail(token_admin, report1["id"])
        if detail:
            print(f"  Report detail: reported={detail['reported_user']['username']}, reason={detail['reason']}, status={detail['status']}")
            if detail.get("game_summary"):
                gs = detail["game_summary"]
                print(f"  Game: {gs['white_username']} vs {gs['black_username']}, {gs['result']}, {gs['move_count']} moves")

    # --- Step 6: Run analysis ---
    print("\n[6] Running cheat analysis...")
    analysis1 = None
    analysis2 = None
    analysis3 = None
    if report1:
        analysis1 = run_analysis(token_admin, report1["id"])
    if report2:
        analysis2 = run_analysis(token_admin, report2["id"])
    if report3:
        analysis3 = run_analysis(token_admin, report3["id"])
        if analysis3:
            print(f"  Game 3 analysis details:")
            print(f"    T1={analysis3.get('t1_pct')}%, T2={analysis3.get('t2_pct')}%, T3={analysis3.get('t3_pct')}%")
            print(f"    ACPL={analysis3.get('avg_centipawn_loss')}, WCL={analysis3.get('avg_winning_chances_loss')}")
            print(f"    Best streak={analysis3.get('best_move_streak')}, Accuracy={analysis3.get('accuracy_score')}%")
            print(f"    Moves analyzed={analysis3.get('total_moves_analyzed')}, Forced excluded={analysis3.get('forced_moves_excluded')}, Book skipped={analysis3.get('book_moves_excluded')}")
            print(f"    Verdict={analysis3.get('verdict')}, Confidence={analysis3.get('confidence')}")
            print(f"    Suspicious moves: {analysis3.get('suspicious_moves')}")
            pos = analysis3.get('position_stats', {})
            for cat in ('undecided', 'losing', 'winning', 'post_losing'):
                s = pos.get(cat, {})
                print(f"    {cat}: count={s.get('count',0)}, T1={s.get('t1_pct',0)}%, ACPL={s.get('acpl',0)}")
            cp = analysis3.get('cp_loss_distribution', {})
            print(f"    CP distribution: {cp}")
            mc = analysis3.get('move_classifications', [])
            print(f"    Move classifications: {len(mc)} moves")
            for m in mc[:5]:
                print(f"      ply={m.get('ply')} {m.get('move_san'):6s} cp_loss={m.get('cp_loss'):6.1f} rank={m.get('rank')} cat={m.get('position_category'):12s} class={m.get('classification')}")
            if len(mc) > 5:
                print(f"      ... and {len(mc)-5} more moves")

    # --- Step 7: Resolve reports ---
    print("\n[7] Resolving reports...")
    if report1:
        resolve_report(token_admin, report1["id"], "resolved_cheating", "Scholar's Mate with suspicious timing")
    if report2:
        resolve_report(token_admin, report2["id"], "resolved_clean", "Normal game, player resigned voluntarily")
    if report3:
        resolve_report(token_admin, report3["id"], "resolved_cheating", "High engine correlation in long game")

    # --- Step 8: Verify Irwin training data ---
    print("\n[8] Checking Irwin training data...")
    irwin = get_irwin_status(token_admin)

    # --- Step 9: Try training (will likely fail with <100 labels) ---
    print("\n[9] Attempting Irwin training...")
    train_result = train_irwin(token_admin)
    if train_result:
        print(f"  Training result: {json.dumps(train_result, indent=2)}")

    # --- Step 10: Verify final state ---
    print("\n[10] Final verification...")
    if report1:
        final_detail = get_report_detail(token_admin, report1["id"])
        if final_detail:
            print(f"  Report 1 status: {final_detail['status']}")
            if final_detail.get("analysis"):
                a = final_detail["analysis"]
                print(f"  Analysis: verdict={a['verdict']}, T1={a['t1_pct']}%, ACPL={a['avg_centipawn_loss']}, irwin_score={a.get('irwin_score')}")

    all_final = list_reports(token_admin)
    irwin_final = get_irwin_status(token_admin)

    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print(f"  Reports created: {len([r for r in [report1, report2, report3] if r])}")
    print(f"  Total reports in system: {len(all_final)}")
    if irwin_final:
        print(f"  Irwin labels: {irwin_final['labeled_count']} (cheating: {irwin_final['cheating_count']}, clean: {irwin_final['clean_count']})")
    print("=" * 60)


if __name__ == "__main__":
    main()
