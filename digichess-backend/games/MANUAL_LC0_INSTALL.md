# Manual lc0 Installation Guide

## Step 1: Download lc0

**Option A: Via Browser (Recommended)**
1. Go to: https://github.com/LeelaChessZero/lc0/releases/latest
2. Look for a file named something like:
   - `lc0-v0.32.1-linux-cpu-x64.tar.gz` (CPU version - recommended)
   - `lc0-v0.32.1-linux-cuda-x64.tar.gz` (CUDA version - if you have NVIDIA GPU)
3. Download the file to `/tmp/`

**Option B: Via Command Line**
```bash
cd /tmp
# Try latest version (v0.32.1)
wget https://github.com/LeelaChessZero/lc0/releases/download/v0.32.1/lc0-v0.32.1-linux-cpu-x64.tar.gz

# Or if that doesn't work, try v0.30.0
wget https://github.com/LeelaChessZero/lc0/releases/download/v0.30.0/lc0-v0.30.0-linux-cpu-x64.tar.gz
```

## Step 2: Extract and Install

```bash
cd /tmp

# Extract (replace filename with actual downloaded filename)
tar -xzf lc0-v0.32.1-linux-cpu-x64.tar.gz
# OR
tar -xzf lc0-v0.30.0-linux-cpu-x64.tar.gz

# Find the lc0 binary
find . -name "lc0" -type f

# Install to user directory
mkdir -p ~/.local/bin
cp lc0-*/lc0 ~/.local/bin/lc0  # Adjust path based on extracted folder name
chmod +x ~/.local/bin/lc0

# Add to PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

## Step 3: Verify

```bash
~/.local/bin/lc0 --help
# OR if PATH is set:
lc0 --help
```

## Step 4: Test Maia Integration

```bash
cd ~/digichess-frontend/digichess-backend
python manage.py test_maia
```

## Alternative: Build from Source

If downloads don't work, you can build from source:

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

## Note

**The system will work WITHOUT lc0** - it will automatically use Stockfish for all bots. Installing lc0 enables Maia (human-like play) for bots rated 800-1900.



