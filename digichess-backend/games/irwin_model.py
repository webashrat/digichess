"""
Irwin-inspired cheat model for DigiChess.

The original Irwin network shape is kept as the neural backbone, but the
training pipeline adds a learned calibration profile built from the same
labeled tensors. That calibration layer helps the model produce more stable
predictions on smaller, evolving datasets while still using the sequence
model as the primary trainable component.
"""

import json
import logging
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
MODEL_PATH = MODEL_DIR / "irwin_basic.h5"
MODEL_META_PATH = MODEL_DIR / "irwin_basic_meta.json"

_SEQUENCE_LENGTH = 60
_FEATURE_DIM = 8
_PIECE_EMBED_INPUT_DIM = 8


def _ensure_model_dir():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)


def _prepare_tensor_inputs(tensor_data: dict) -> tuple[np.ndarray, np.ndarray]:
    move_features = np.asarray(tensor_data.get("move_features", []), dtype="float32")
    piece_types = np.asarray(tensor_data.get("piece_types", []), dtype="float32")

    if move_features.shape != (_SEQUENCE_LENGTH, _FEATURE_DIM):
        raise ValueError(
            f"Expected move_features shape ({_SEQUENCE_LENGTH}, {_FEATURE_DIM}), "
            f"got {tuple(move_features.shape)}"
        )

    if piece_types.ndim == 1:
        piece_types = piece_types.reshape(_SEQUENCE_LENGTH, 1)
    elif piece_types.shape == (_SEQUENCE_LENGTH,):
        piece_types = piece_types.reshape(_SEQUENCE_LENGTH, 1)

    if piece_types.shape != (_SEQUENCE_LENGTH, 1):
        raise ValueError(
            f"Expected piece_types shape ({_SEQUENCE_LENGTH}, 1), "
            f"got {tuple(piece_types.shape)}"
        )

    piece_types = np.clip(np.rint(piece_types), 0, _PIECE_EMBED_INPUT_DIM - 1).astype("int32")
    return move_features, piece_types


def _extract_calibration_features(move_features: np.ndarray, piece_types: np.ndarray) -> np.ndarray:
    first_window = move_features[:10]
    last_window = move_features[-10:]
    piece_counts = np.bincount(
        piece_types.reshape(-1),
        minlength=_PIECE_EMBED_INPUT_DIM,
    ).astype("float32")
    piece_ratios = piece_counts / max(float(piece_counts.sum()), 1.0)

    summary = np.concatenate(
        [
            move_features.mean(axis=0),
            move_features.std(axis=0),
            move_features.min(axis=0),
            move_features.max(axis=0),
            move_features[-1],
            last_window.mean(axis=0),
            last_window.mean(axis=0) - first_window.mean(axis=0),
            piece_ratios,
        ],
        axis=0,
    )
    return summary.astype("float32")


def _build_calibration_profile(features: np.ndarray, labels: np.ndarray) -> Optional[dict]:
    clean_mask = labels < 0.5
    cheat_mask = labels >= 0.5
    if not clean_mask.any() or not cheat_mask.any():
        return None

    feature_mean = features.mean(axis=0)
    feature_std = features.std(axis=0)
    feature_std = np.where(feature_std < 1e-6, 1.0, feature_std)

    normalized = (features - feature_mean) / feature_std
    clean_centroid = normalized[clean_mask].mean(axis=0)
    cheat_centroid = normalized[cheat_mask].mean(axis=0)
    centroid_gap = float(np.linalg.norm(cheat_centroid - clean_centroid))

    return {
        "feature_mean": feature_mean.tolist(),
        "feature_std": feature_std.tolist(),
        "clean_centroid": clean_centroid.tolist(),
        "cheat_centroid": cheat_centroid.tolist(),
        "centroid_gap": centroid_gap,
        "samples": int(len(labels)),
    }


def _score_with_calibration(calibration_profile: Optional[dict], tensor_data: dict) -> Optional[float]:
    if not calibration_profile:
        return None

    move_features, piece_types = _prepare_tensor_inputs(tensor_data)
    feature_vector = _extract_calibration_features(move_features, piece_types)
    feature_mean = np.asarray(calibration_profile["feature_mean"], dtype="float32")
    feature_std = np.asarray(calibration_profile["feature_std"], dtype="float32")
    clean_centroid = np.asarray(calibration_profile["clean_centroid"], dtype="float32")
    cheat_centroid = np.asarray(calibration_profile["cheat_centroid"], dtype="float32")

    normalized = (feature_vector - feature_mean) / feature_std
    clean_distance = float(np.linalg.norm(normalized - clean_centroid))
    cheat_distance = float(np.linalg.norm(normalized - cheat_centroid))
    distance_total = max(clean_distance + cheat_distance, 1e-6)
    distance_score = clean_distance / distance_total

    centroid_gap = max(float(calibration_profile.get("centroid_gap", 1.0)), 1e-6)
    margin = (clean_distance - cheat_distance) / centroid_gap
    logistic_score = 1.0 / (1.0 + np.exp(-margin))
    return float(np.clip((distance_score + logistic_score) / 2.0, 0.0, 1.0))


def _stratified_split_indices(labels: np.ndarray, *, train_ratio: float = 0.8) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(42)
    labels = labels.astype("float32")
    positive = np.where(labels >= 0.5)[0]
    negative = np.where(labels < 0.5)[0]
    rng.shuffle(positive)
    rng.shuffle(negative)

    def _split_group(indices: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        if len(indices) <= 1:
            return indices, np.array([], dtype="int64")
        split_at = int(round(len(indices) * train_ratio))
        split_at = min(max(split_at, 1), len(indices) - 1)
        return indices[:split_at], indices[split_at:]

    pos_train, pos_val = _split_group(positive)
    neg_train, neg_val = _split_group(negative)

    train_idx = np.concatenate([pos_train, neg_train]).astype("int64")
    val_idx = np.concatenate([pos_val, neg_val]).astype("int64")
    rng.shuffle(train_idx)
    rng.shuffle(val_idx)
    return train_idx, val_idx


def _build_model():
    """
    Build the Irwin neural backbone used by DigiChess.

    This keeps the original dual-branch sequence model shape while the broader
    training pipeline adds calibration metadata around it.
    """
    try:
        from keras.models import Model
        from keras.layers import (
            Input, Dense, Dropout, Embedding, Reshape,
            Flatten, LSTM, Conv1D, concatenate,
        )
        from keras.optimizers import Adam
    except ImportError:
        from tensorflow.keras.models import Model
        from tensorflow.keras.layers import (
            Input, Dense, Dropout, Embedding, Reshape,
            Flatten, LSTM, Conv1D, concatenate,
        )
        from tensorflow.keras.optimizers import Adam

    move_input = Input(shape=(_SEQUENCE_LENGTH, _FEATURE_DIM), dtype="float32", name="move_input")
    piece_type = Input(shape=(_SEQUENCE_LENGTH, 1), dtype="int32", name="piece_type")

    piece_embed = Embedding(input_dim=_PIECE_EMBED_INPUT_DIM, output_dim=8)(piece_type)
    rshape = Reshape((_SEQUENCE_LENGTH, 8))(piece_embed)

    concats = concatenate(inputs=[move_input, rshape])

    # --- Conv Net Branch ---
    conv1 = Conv1D(filters=64, kernel_size=3, activation="relu")(concats)
    dense1 = Dense(32, activation="relu")(conv1)
    conv2 = Conv1D(filters=64, kernel_size=5, activation="relu")(dense1)
    dense2 = Dense(32, activation="sigmoid")(conv2)
    conv3 = Conv1D(filters=64, kernel_size=10, activation="relu")(dense2)
    dense3 = Dense(16, activation="relu")(conv3)
    dense4 = Dense(8, activation="sigmoid")(dense3)

    f = Flatten()(dense4)
    dense5 = Dense(64, activation="relu")(f)
    conv_output = Dense(16, activation="sigmoid")(dense5)

    # --- LSTM Branch ---
    mv1 = Dense(32, activation="relu")(concats)
    d1 = Dropout(0.3)(mv1)
    mv2 = Dense(16, activation="relu")(d1)

    c1 = Conv1D(filters=64, kernel_size=5, name="lstm_conv1")(mv2)

    l1 = LSTM(64, return_sequences=True)(c1)
    l2 = LSTM(32, return_sequences=True, activation="relu")(l1)

    c2 = Conv1D(filters=64, kernel_size=10, name="lstm_conv2")(l2)

    l3 = LSTM(32, return_sequences=True)(c2)
    l4 = LSTM(16, return_sequences=True, activation="relu", recurrent_activation="hard_sigmoid")(l3)
    l5 = LSTM(16, activation="sigmoid")(l4)

    # --- Merge ---
    merged = concatenate([l5, conv_output])
    dense_out = Dense(16, activation="sigmoid")(merged)
    main_output = Dense(1, activation="sigmoid", name="main_output")(dense_out)

    model = Model(inputs=[move_input, piece_type], outputs=main_output)
    model.compile(
        optimizer=Adam(learning_rate=0.0005),
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )
    return model


class IrwinModel:
    """Wrapper around the Irwin Keras model with load/predict/train/save."""

    def __init__(self):
        self._model = None
        self._calibration_profile = None

    def _load_calibration(self):
        if self._calibration_profile is not None:
            return
        if not MODEL_META_PATH.exists():
            return
        try:
            self._calibration_profile = json.loads(MODEL_META_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("Failed to load Irwin calibration profile: %s", exc)
            self._calibration_profile = None

    def _save_calibration(self, calibration_profile: Optional[dict]):
        self._calibration_profile = calibration_profile
        if calibration_profile is None:
            return
        _ensure_model_dir()
        MODEL_META_PATH.write_text(
            json.dumps(calibration_profile, indent=2),
            encoding="utf-8",
        )

    def _load_or_build(self, force_new: bool = False):
        if self._model is not None and not force_new:
            return

        if force_new:
            self._calibration_profile = None

        if not force_new and MODEL_PATH.exists():
            logger.info("Loading Irwin model from %s", MODEL_PATH)
            try:
                try:
                    from keras.models import load_model
                except ImportError:
                    from tensorflow.keras.models import load_model
                self._model = load_model(str(MODEL_PATH))
                return
            except Exception as exc:
                logger.warning("Failed to load Irwin model, building new: %s", exc)

        logger.info("Building new Irwin model")
        self._model = _build_model()

    def is_trained(self) -> bool:
        return MODEL_PATH.exists()

    def _predict_neural_probability(self, move_features: np.ndarray, piece_types: np.ndarray) -> Optional[float]:
        self._load_or_build()
        if self._model is None:
            return None
        try:
            prediction = self._model.predict(
                [move_features[None, ...], piece_types[None, ...]],
                verbose=0,
            )
            return float(prediction[0][0])
        except Exception as exc:
            logger.error("Irwin neural prediction failed: %s", exc)
            return None

    def predict(self, tensor_data: dict) -> Optional[int]:
        """
        Predict cheat probability for one game.

        tensor_data: {"move_features": [[...]*60], "piece_types": [[...]*60]}
        Returns 0-100 score, or None if model is not trained.
        """
        if not self.is_trained():
            return None

        try:
            move_features, piece_types = _prepare_tensor_inputs(tensor_data)
        except Exception as exc:
            logger.error("Irwin input preparation failed: %s", exc)
            return None

        self._load_calibration()
        neural_probability = self._predict_neural_probability(move_features, piece_types)
        calibration_probability = _score_with_calibration(
            self._calibration_profile,
            {
                "move_features": move_features,
                "piece_types": piece_types,
            },
        )

        if neural_probability is None and calibration_probability is None:
            return None
        if neural_probability is None:
            final_probability = calibration_probability
        elif calibration_probability is None:
            final_probability = neural_probability
        else:
            final_probability = (0.35 * neural_probability) + (0.65 * calibration_probability)

        return int(round(float(np.clip(final_probability, 0.0, 1.0)) * 100))

    def train(self, training_records, epochs: int = 80, batch_size: int = 32) -> dict:
        """
        Train the model on labeled data.

        training_records: list of dicts with "tensor_data" and "label" keys.
        Returns training metrics.
        """
        if len(training_records) < 10:
            raise ValueError(f"Need at least 10 labeled games, got {len(training_records)}")

        self._load_or_build(force_new=True)

        move_features = []
        piece_types = []
        calibration_features = []
        labels = []

        for record in training_records:
            td = record["tensor_data"]
            move_array, piece_array = _prepare_tensor_inputs(td)
            move_features.append(move_array)
            piece_types.append(piece_array)
            calibration_features.append(_extract_calibration_features(move_array, piece_array))
            labels.append(1.0 if record["label"] else 0.0)

        x_moves = np.array(move_features, dtype="float32")
        x_pieces = np.array(piece_types, dtype="int32")
        calibration_matrix = np.array(calibration_features, dtype="float32")
        y = np.array(labels, dtype="float32")

        if len(np.unique(y)) < 2:
            raise ValueError("Need at least one clean and one cheating label to train Irwin.")

        train_idx, val_idx = _stratified_split_indices(y, train_ratio=0.8)
        x_train = [x_moves[train_idx], x_pieces[train_idx]]
        y_train = y[train_idx]
        x_val = [x_moves[val_idx], x_pieces[val_idx]] if len(val_idx) > 0 else None
        y_val = y[val_idx] if len(val_idx) > 0 else None
        calibration_profile = _build_calibration_profile(calibration_matrix, y)

        history = self._model.fit(
            x_train, y_train,
            validation_data=(x_val, y_val) if y_val is not None and len(y_val) > 0 else None,
            epochs=epochs,
            batch_size=batch_size,
            verbose=0,
            shuffle=True,
        )

        _ensure_model_dir()
        self._model.save(str(MODEL_PATH))
        self._save_calibration(calibration_profile)
        logger.info("Irwin model saved to %s", MODEL_PATH)

        final_metrics = {
            "epochs": epochs,
            "samples": len(labels),
            "train_loss": float(history.history["loss"][-1]),
            "train_accuracy": float(history.history["accuracy"][-1]),
        }
        if "val_loss" in history.history:
            final_metrics["val_loss"] = float(history.history["val_loss"][-1])
            final_metrics["val_accuracy"] = float(history.history["val_accuracy"][-1])
        if calibration_profile:
            final_metrics["calibration_gap"] = float(calibration_profile["centroid_gap"])

        return final_metrics

    def save(self):
        if self._model:
            _ensure_model_dir()
            self._model.save(str(MODEL_PATH))
        if self._calibration_profile is not None:
            self._save_calibration(self._calibration_profile)


irwin = IrwinModel()
