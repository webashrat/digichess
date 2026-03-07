from statistics import mean

import numpy as np
import pytest


def _configure_temp_model(monkeypatch, tmp_path):
    tf = pytest.importorskip("tensorflow")
    import games.irwin_model as irwin_module

    model_dir = tmp_path / "models"
    model_path = model_dir / "irwin_basic.h5"
    monkeypatch.setattr(irwin_module, "MODEL_DIR", model_dir)
    monkeypatch.setattr(irwin_module, "MODEL_PATH", model_path)
    monkeypatch.setattr(irwin_module, "MODEL_META_PATH", model_dir / "irwin_basic_meta.json")
    irwin_module.irwin._model = None
    irwin_module.irwin._calibration_profile = None
    np.random.seed(7)
    tf.random.set_seed(7)
    return irwin_module, model_path


def _make_record(label, rng):
    if label:
        template = [0.92, 0.72, 0.65, 0.18, 0.16, 0.82, 0.88, 1.0]
        piece = 6
    else:
        template = [0.08, 0.03, 0.02, -0.12, -0.08, 0.22, 0.28, 0.0]
        piece = 1

    move_features = []
    for move_idx in range(60):
        row = []
        for value in template:
            noise = rng.normal(0, 0.015)
            row.append(float(np.clip(value + noise, -1.0, 1.0)))
        row[5] = float(np.clip(row[5] + move_idx * 0.0015, -1.0, 1.0))
        row[6] = float(np.clip(row[6] + move_idx * 0.001, -1.0, 1.0))
        move_features.append(row)

    return {
        "tensor_data": {
            "move_features": move_features,
            "piece_types": [[piece] for _ in range(60)],
        },
        "label": label,
    }


def test_irwin_train_creates_model_file_and_predictions(tmp_path, monkeypatch):
    irwin_module, model_path = _configure_temp_model(monkeypatch, tmp_path)
    rng = np.random.default_rng(10)
    training_records = [
        _make_record(label=(idx % 2 == 0), rng=rng)
        for idx in range(12)
    ]

    metrics = irwin_module.irwin.train(training_records, epochs=2, batch_size=4)

    assert model_path.exists()
    assert metrics["samples"] == 12
    assert irwin_module.irwin.is_trained() is True

    cheat_score = irwin_module.irwin.predict(_make_record(True, np.random.default_rng(100))["tensor_data"])
    clean_score = irwin_module.irwin.predict(_make_record(False, np.random.default_rng(101))["tensor_data"])

    assert isinstance(cheat_score, int)
    assert isinstance(clean_score, int)

    irwin_module.irwin._model = None

def test_irwin_training_with_100_plus_samples_separates_holdout_predictions(tmp_path, monkeypatch):
    irwin_module, model_path = _configure_temp_model(monkeypatch, tmp_path)
    rng = np.random.default_rng(42)

    training_records = []
    for _ in range(60):
        training_records.append(_make_record(False, rng))
        training_records.append(_make_record(True, rng))

    metrics = irwin_module.irwin.train(training_records, epochs=5, batch_size=16)

    assert model_path.exists()
    assert metrics["samples"] == 120

    clean_scores = [
        irwin_module.irwin.predict(_make_record(False, np.random.default_rng(seed))["tensor_data"])
        for seed in range(200, 210)
    ]
    cheat_scores = [
        irwin_module.irwin.predict(_make_record(True, np.random.default_rng(seed))["tensor_data"])
        for seed in range(300, 310)
    ]

    assert all(score is not None for score in clean_scores)
    assert all(score is not None for score in cheat_scores)
    assert mean(cheat_scores) > mean(clean_scores) + 20
    assert sum(score >= 50 for score in cheat_scores) >= 8
    assert sum(score < 50 for score in clean_scores) >= 8

    irwin_module.irwin._model = None
