# Quick Start: Maia Chess Integration

## ✅ Step 1: Models Downloaded ✓
All Maia models have been successfully downloaded to `games/maia_models/`

## 📥 Step 2: Install lc0 Engine

### Option A: Download Pre-built Binary (Easiest)

1. **Go to lc0 releases page**: https://github.com/LeelaChessZero/lc0/releases
2. **Download the latest Linux build**:
   - For CPU-only: `lc0-v0.30.0-linux-cpu-x64.tar.gz`
   - For CUDA (if you have NVIDIA GPU): `lc0-v0.30.0-linux-cuda-x64.tar.gz`

3. **Extract and install**:
   ```bash
   cd /tmp
   # Download the file manually or use:
   wget https://github.com/LeelaChessZero/lc0/releases/download/v0.30.0/lc0-v0.30.0-linux-cpu-x64.tar.gz
   tar -xzf lc0-v0.30.0-linux-cpu-x64.tar.gz
   
   # Install to user directory
   mkdir -p ~/.local/bin
   cp lc0-v0.30.0-linux-cpu-x64/lc0 ~/.local/bin/
   chmod +x ~/.local/bin/lc0
   
   # Add to PATH (add to ~/.bashrc for permanent)
   export PATH="$HOME/.local/bin:$PATH"
   ```

4. **Verify**:
   ```bash
   ~/.local/bin/lc0 --help
   ```

### Option B: Build from Source

```bash
sudo apt-get update
sudo apt-get install -y cmake build-essential libprotobuf-dev protobuf-compiler

git clone https://github.com/LeelaChessZero/lc0.git
cd lc0
git submodule update --init --recursive
mkdir build && cd build
cmake ..
cmake --build . --config Release
sudo cp lc0 /usr/local/bin/
```

## 🧪 Step 3: Test Integration

```bash
cd digichess-backend
python manage.py test_maia
```

This will:
- Check if lc0 is installed
- Verify all models are present
- Test move generation

## 🎮 Step 4: Use It!

The system will automatically:
- **Use Maia** for bots rated 800-1900 (human-like play)
- **Use Stockfish** for bots rated 1900-2500 (strong play)
- **Fallback** to Stockfish if Maia fails

No code changes needed - it's already integrated!

## 🔧 Configuration (Optional)

Add to `settings.py` if lc0 is in a custom location:

```python
LC0_PATH = "/path/to/lc0"  # Optional, will auto-detect
MAIA_MODELS_DIR = "/path/to/maia_models"  # Optional, default is games/maia_models
```

## ❓ Troubleshooting

**"lc0 not found"**:
- Make sure lc0 is in PATH: `which lc0`
- Or set `LC0_PATH` in settings.py

**"Model not found"**:
- Check: `ls games/maia_models/`
- Re-download: `python manage.py setup_maia --all`

**Slow moves**:
- Maia can be slower than Stockfish
- Consider using CPU build if GPU is slow
- Timeout is set to 1 second by default




