"""
Irwin Neural Network – ported from clarkerubber/irwin (AGPL-3.0)
https://github.com/clarkerubber/irwin/blob/master/modules/irwin/BasicGameModel.py

Dual-branch architecture: Conv1D + LSTM → sigmoid cheat probability.
Input: 60 moves × 8 features + piece type embedding.

This module provides predict / train / is_trained methods that integrate
with the DigiChess anti-cheat pipeline.  The model file is stored locally
and is gitignored – each deployment trains its own model from labeled data.
"""

import logging
import os
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
MODEL_PATH = MODEL_DIR / "irwin_basic.h5"

_SEQUENCE_LENGTH = 60
_FEATURE_DIM = 8


def _ensure_model_dir():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)


def _build_model():
    """
    Build the Irwin BasicGameModel architecture.

    Exact port of the Keras model from:
    https://github.com/clarkerubber/irwin/blob/master/modules/irwin/BasicGameModel.py
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
    piece_type = Input(shape=(_SEQUENCE_LENGTH, 1), dtype="float32", name="piece_type")

    piece_embed = Embedding(input_dim=7, output_dim=8)(piece_type)
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
        optimizer=Adam(learning_rate=0.0001),
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )
    return model


class IrwinModel:
    """Wrapper around the Irwin Keras model with load/predict/train/save."""

    def __init__(self):
        self._model = None

    def _load_or_build(self, force_new: bool = False):
        if self._model is not None and not force_new:
            return

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

    def predict(self, tensor_data: dict) -> Optional[int]:
        """
        Predict cheat probability for one game.

        tensor_data: {"move_features": [[...]*60], "piece_types": [[...]*60]}
        Returns 0-100 score, or None if model is not trained.
        """
        if not self.is_trained():
            return None

        self._load_or_build()

        move_features = np.array([tensor_data["move_features"]], dtype="float32")
        piece_types = np.array([tensor_data["piece_types"]], dtype="float32")

        try:
            prediction = self._model.predict(
                [move_features, piece_types], verbose=0
            )
            return int(round(float(prediction[0][0]) * 100))
        except Exception as exc:
            logger.error("Irwin prediction failed: %s", exc)
            return None

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
        labels = []

        for record in training_records:
            td = record["tensor_data"]
            move_features.append(td["move_features"])
            piece_types.append(td["piece_types"])
            labels.append(1.0 if record["label"] else 0.0)

        x_moves = np.array(move_features, dtype="float32")
        x_pieces = np.array(piece_types, dtype="float32")
        y = np.array(labels, dtype="float32")

        split = max(1, int(len(labels) * 0.8))
        x_train = [x_moves[:split], x_pieces[:split]]
        y_train = y[:split]
        x_val = [x_moves[split:], x_pieces[split:]]
        y_val = y[split:]

        history = self._model.fit(
            x_train, y_train,
            validation_data=(x_val, y_val) if len(y_val) > 0 else None,
            epochs=epochs,
            batch_size=batch_size,
            verbose=0,
        )

        _ensure_model_dir()
        self._model.save(str(MODEL_PATH))
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

        return final_metrics

    def save(self):
        if self._model:
            _ensure_model_dir()
            self._model.save(str(MODEL_PATH))


irwin = IrwinModel()
