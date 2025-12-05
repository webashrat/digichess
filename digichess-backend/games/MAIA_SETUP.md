# Maia Chess Integration Setup Guide

## Overview

This integration uses **Maia Chess** neural network models for human-like bot play at ratings 800-1900, and **Stockfish** for ratings 1900-2500.

## Why Hybrid Approach?

- **Maia (800-1900)**: Provides human-like play patterns, making mistakes similar to human players
- **Stockfish (1900-2500)**: Strong play for advanced ratings where Maia models aren't available
- **Automatic Fallback**: If Maia fails, automatically uses Stockfish

## Setup Steps

### 1. Install lc0 (Leela Chess Zero)

Maia models require the `lc0` engine to run. Install it:

**Linux:**
```bash
# Download from: https://github.com/LeelaChessZero/lc0/releases
# Or build from source: https://github.com/LeelaChessZero/lc0
```

**macOS:**
```bash
brew install lc0
```

**Windows:**
Download from: https://github.com/LeelaChessZero/lc0/releases

### 2. Download Maia Models

Run the management command to download models:

```bash
cd digichess-backend
python manage.py setup_maia --all
```

Or download specific models:
```bash
python manage.py setup_maia --model-rating 1500
```

Models will be downloaded to `games/maia_models/` directory.

### 3. Configure Settings (Optional)

Add to `settings.py`:

```python
# Maia models directory (default: games/maia_models/)
MAIA_MODELS_DIR = "/path/to/maia_models"

# lc0 executable path (optional, will auto-detect)
LC0_PATH = "/usr/local/bin/lc0"
```

### 4. Test Integration

The system will automatically:
- Use Maia for bots rated 800-1900
- Use Stockfish for bots rated 1900-2500
- Fallback to Stockfish if Maia is unavailable

## How It Works

1. **Rating Mapping**: Bot rating is mapped to closest Maia model:
   - 800-1050 → Maia 1100
   - 1050-1250 → Maia 1200
   - 1250-1350 → Maia 1300
   - ... and so on

2. **Move Generation**: 
   - For ratings 800-1900: Tries Maia first, falls back to Stockfish
   - For ratings 1900-2500: Uses Stockfish directly

3. **Performance**: Maia moves are generated via `lc0` subprocess call (typically < 1 second)

## Troubleshooting

**Maia not working?**
- Check if `lc0` is installed: `which lc0`
- Check if models are downloaded: `ls games/maia_models/`
- Check logs for errors

**Slow move generation?**
- Maia models can be slower than Stockfish
- Consider reducing timeout in `get_maia_move_via_lc0()`

**Models not found?**
- Run `python manage.py setup_maia --all` to download all models
- Check `MAIA_MODELS_DIR` setting

## References

- Maia Chess GitHub: https://github.com/CSSLab/maia-chess
- lc0 Engine: https://github.com/LeelaChessZero/lc0
- Maia Paper: https://arxiv.org/abs/2006.14000


