from django.core.files.uploadedfile import SimpleUploadedFile

import pytest

from games.irwin_imports import parse_move_times_seconds, parse_moves_text, save_single_import_sample
from games.models import Game, IrwinImportJob, IrwinTrainingData
from games.tasks import process_irwin_csv_import_job


def _dummy_tensor(signal=0.2, piece=1):
    return {
        "move_features": [[float(signal)] * 8 for _ in range(60)],
        "piece_types": [[piece] for _ in range(60)],
    }


@pytest.fixture
def superuser_client(auth_client, create_user):
    admin = create_user(
        email="admin@example.com",
        username="irwin_admin",
        is_superuser=True,
        is_staff=True,
    )
    client, _ = auth_client(admin)
    return client, admin


def _fake_analysis(signal=0.3, piece=2):
    return {"tensor_data": _dummy_tensor(signal=signal, piece=piece)}


def test_parse_moves_text_defaults_to_standard_start_and_detects_uci():
    moves, start_fen, detected_format = parse_moves_text(
        "e2e4 e7e5 g1f3 b8c6",
        start_fen="",
        move_format=IrwinTrainingData.FORMAT_AUTO,
    )

    assert moves == ["e4", "e5", "Nf3", "Nc6"]
    assert start_fen == Game.START_FEN
    assert detected_format == IrwinTrainingData.FORMAT_UCI


def test_parse_move_times_seconds_requires_matching_move_count():
    with pytest.raises(ValueError, match="must match move count"):
        parse_move_times_seconds("1,2,3", expected_count=2)


@pytest.mark.django_db
def test_save_single_import_sample_uses_blank_start_fen_and_persists_metadata(create_user, monkeypatch):
    admin = create_user(
        email="admin-save@example.com",
        username="admin_save",
        is_superuser=True,
        is_staff=True,
    )
    captured = {}

    def fake_run(move_list, player_is_white, move_times_ms=None, start_fen=None, player_rating=800, **kwargs):
        captured["move_list"] = move_list
        captured["player_is_white"] = player_is_white
        captured["move_times_ms"] = move_times_ms
        captured["start_fen"] = start_fen
        captured["player_rating"] = player_rating
        return _fake_analysis(signal=0.45, piece=4)

    monkeypatch.setattr("games.irwin_imports.run_cheat_analysis_from_sequence", fake_run)

    sample = save_single_import_sample(
        labeled_by=admin,
        moves_text="e2e4 e7e5 g1f3 b8c6",
        suspect_color="white",
        label="clean",
        move_times_seconds="1,2,3,4",
        start_fen="",
        move_format="auto",
        source_ref="https://lichess.org/example",
        external_id="sample-001",
        notes="Blank FEN should become standard start",
    )

    assert sample.start_fen == Game.START_FEN
    assert sample.move_times_seconds == [1.0, 2.0, 3.0, 4.0]
    assert sample.move_format == IrwinTrainingData.FORMAT_UCI
    assert sample.source_type == IrwinTrainingData.SOURCE_SINGLE_IMPORT
    assert sample.label is False
    assert captured["start_fen"] == Game.START_FEN
    assert captured["player_is_white"] is True
    assert captured["move_times_ms"] == [1000, 2000, 3000, 4000]
    assert captured["move_list"] == ["e4", "e5", "Nf3", "Nc6"]


@pytest.mark.django_db
def test_single_import_endpoint_creates_training_sample(superuser_client, monkeypatch):
    client, admin = superuser_client

    monkeypatch.setattr(
        "games.irwin_imports.run_cheat_analysis_from_sequence",
        lambda *args, **kwargs: _fake_analysis(signal=0.62, piece=5),
    )

    response = client.post(
        "/api/games/anticheat/irwin/imports/single/",
        {
            "moves": "e2e4 e7e5 g1f3 b8c6",
            "suspect_color": "black",
            "label": "cheat",
            "move_times_seconds": "3,3,4,4",
            "start_fen": "",
            "move_format": "auto",
            "source_ref": "https://example.com/game",
            "external_id": "ext-123",
            "notes": "single import endpoint",
        },
        format="json",
    )

    assert response.status_code == 201, response.data
    sample = IrwinTrainingData.objects.get(external_id="ext-123")
    assert sample.labeled_by == admin
    assert sample.label is True
    assert sample.suspect_color == IrwinTrainingData.COLOR_BLACK
    assert sample.source_type == IrwinTrainingData.SOURCE_SINGLE_IMPORT
    assert sample.start_fen == Game.START_FEN


@pytest.mark.django_db
def test_csv_upload_creates_job_and_enqueues_task(superuser_client, monkeypatch):
    client, _admin = superuser_client
    enqueued = {}

    def fake_delay(job_id):
        enqueued["job_id"] = job_id

    monkeypatch.setattr("games.tasks.process_irwin_csv_import_job.delay", fake_delay)

    csv_bytes = (
        b"moves,suspect_color,label\n"
        b"e2e4 e7e5 g1f3 b8c6,white,clean\n"
    )
    upload = SimpleUploadedFile("samples.csv", csv_bytes, content_type="text/csv")

    response = client.post(
        "/api/games/anticheat/irwin/import-jobs/",
        {"file": upload},
        format="multipart",
    )

    assert response.status_code == 201, response.data
    job = IrwinImportJob.objects.get(file_name="samples.csv")
    assert job.status == IrwinImportJob.STATUS_QUEUED
    assert job.total_rows == 1
    assert enqueued["job_id"] == job.id


@pytest.mark.django_db
def test_process_irwin_csv_import_job_imports_valid_rows_and_records_errors(create_user, monkeypatch):
    admin = create_user(
        email="admin-job@example.com",
        username="admin_job",
        is_superuser=True,
        is_staff=True,
    )
    monkeypatch.setattr(
        "games.irwin_imports.run_cheat_analysis_from_sequence",
        lambda *args, **kwargs: _fake_analysis(signal=0.51, piece=3),
    )

    job = IrwinImportJob.objects.create(
        upload_type=IrwinImportJob.TYPE_CSV,
        status=IrwinImportJob.STATUS_QUEUED,
        file_name="batch.csv",
        csv_content=(
            "moves,suspect_color,label,moves_format,external_id\n"
            "e2e4 e7e5 g1f3 b8c6,white,clean,uci,batch-1\n"
            "e2e4 e7e5,bad_color,cheat,uci,batch-2\n"
        ),
        total_rows=2,
        uploaded_by=admin,
    )

    process_irwin_csv_import_job(job.id)

    job.refresh_from_db()
    assert job.status == IrwinImportJob.STATUS_COMPLETED
    assert job.imported_rows == 1
    assert job.failed_rows == 1
    assert job.processed_rows == 2
    assert len(job.row_errors) == 1
    assert job.row_errors[0]["row"] == 2

    sample = IrwinTrainingData.objects.get(external_id="batch-1")
    assert sample.import_job == job
    assert sample.import_row_number == 1
    assert sample.source_type == IrwinTrainingData.SOURCE_CSV_IMPORT
    assert sample.label is False


@pytest.mark.django_db
def test_irwin_status_counts_include_imported_samples(superuser_client):
    client, admin = superuser_client
    IrwinTrainingData.objects.create(
        game=None,
        player=None,
        label=True,
        tensor_data=_dummy_tensor(signal=0.8, piece=6),
        source_type=IrwinTrainingData.SOURCE_SINGLE_IMPORT,
        suspect_color=IrwinTrainingData.COLOR_WHITE,
        moves_text="e4 e5",
        start_fen=Game.START_FEN,
        move_times_seconds=[],
        move_format=IrwinTrainingData.FORMAT_SAN,
        source_ref="import:1",
        external_id="status-1",
        notes="",
        labeled_by=admin,
    )
    IrwinTrainingData.objects.create(
        game=None,
        player=None,
        label=False,
        tensor_data=_dummy_tensor(signal=0.1, piece=1),
        source_type=IrwinTrainingData.SOURCE_CSV_IMPORT,
        suspect_color=IrwinTrainingData.COLOR_BLACK,
        moves_text="e4 e5",
        start_fen=Game.START_FEN,
        move_times_seconds=[],
        move_format=IrwinTrainingData.FORMAT_SAN,
        source_ref="import:2",
        external_id="status-2",
        notes="",
        labeled_by=admin,
    )

    response = client.get("/api/games/anticheat/irwin/status/")

    assert response.status_code == 200
    assert response.data["labeled_count"] == 2
    assert response.data["cheating_count"] == 1
    assert response.data["clean_count"] == 1


@pytest.mark.django_db
def test_irwin_train_endpoint_uses_imported_samples(superuser_client, monkeypatch):
    client, admin = superuser_client
    IrwinTrainingData.objects.create(
        game=None,
        player=None,
        label=True,
        tensor_data=_dummy_tensor(signal=0.9, piece=6),
        source_type=IrwinTrainingData.SOURCE_SINGLE_IMPORT,
        suspect_color=IrwinTrainingData.COLOR_WHITE,
        moves_text="e4 e5",
        start_fen=Game.START_FEN,
        move_times_seconds=[],
        move_format=IrwinTrainingData.FORMAT_SAN,
        source_ref="endpoint:1",
        external_id="train-1",
        notes="",
        labeled_by=admin,
    )
    IrwinTrainingData.objects.create(
        game=None,
        player=None,
        label=False,
        tensor_data=_dummy_tensor(signal=0.05, piece=1),
        source_type=IrwinTrainingData.SOURCE_CSV_IMPORT,
        suspect_color=IrwinTrainingData.COLOR_BLACK,
        moves_text="d4 d5",
        start_fen=Game.START_FEN,
        move_times_seconds=[],
        move_format=IrwinTrainingData.FORMAT_SAN,
        source_ref="endpoint:2",
        external_id="train-2",
        notes="",
        labeled_by=admin,
    )

    monkeypatch.setattr("games.views_anticheat.IRWIN_TRAINING_THRESHOLD", 2)
    captured = {}

    def fake_train(training_records, epochs=80, batch_size=32):
        captured["records"] = training_records
        captured["epochs"] = epochs
        return {"samples": len(training_records), "train_accuracy": 0.99}

    monkeypatch.setattr("games.irwin_model.irwin.train", fake_train)

    response = client.post(
        "/api/games/anticheat/irwin/train/",
        {"epochs": 3},
        format="json",
    )

    assert response.status_code == 200, response.data
    assert response.data["metrics"]["samples"] == 2
    assert captured["epochs"] == 3
    assert len(captured["records"]) == 2
    assert {record["label"] for record in captured["records"]} == {True, False}
