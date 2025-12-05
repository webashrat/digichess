# Building lc0 - Step by Step Guide

## Prerequisites

You need to install `meson` and `ninja` build tools. Choose one method:

### Option A: Install via pip (in your venv)
```bash
cd ~/digichess-frontend/digichess-backend
pyenv shell venv
pip install meson ninja
```

### Option B: Install system-wide (requires sudo)
```bash
sudo apt-get update
sudo apt-get install -y meson ninja-build
```

## Build Steps

```bash
# 1. Navigate to lc0 directory
cd ~/lc0

# 2. Make sure you're on the release branch (you already did this)
git checkout release/0.32

# 3. Update submodules
git submodule update --init --recursive

# 4. Build using the build script
# If meson is installed via pip:
export PATH="$HOME/.local/bin:$PATH:$(python3 -m site --user-base)/bin"
./build.sh release

# OR if meson is system-wide:
./build.sh release

# 5. The binary will be in: build/release/lc0
# Install it:
mkdir -p ~/.local/bin
cp build/release/lc0 ~/.local/bin/
chmod +x ~/.local/bin/lc0
export PATH="$HOME/.local/bin:$PATH"

# 6. Verify
lc0 --help
```

## Alternative: Manual Meson Build

If the build script doesn't work:

```bash
cd ~/lc0
meson setup build/release --buildtype release
cd build/release
ninja
# Binary will be at: build/release/lc0
```

## Troubleshooting

**"Could not find meson"**:
- Make sure meson is installed: `pip install meson ninja` or `sudo apt-get install meson`
- Add to PATH: `export PATH="$HOME/.local/bin:$PATH"`

**Build errors**:
- Install dependencies: `sudo apt-get install -y libprotobuf-dev protobuf-compiler libopenblas-dev`

**Still having issues?**:
- The system works perfectly without lc0 using Stockfish
- You can always come back to this later



