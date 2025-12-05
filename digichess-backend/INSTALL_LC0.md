# Installing lc0 (Leela Chess Zero) for Maia Chess

## Quick Install for Ubuntu/Debian

### Option 1: Download Pre-built Binary (Recommended)

1. **Download lc0**:
   ```bash
   cd /tmp
   wget https://github.com/LeelaChessZero/lc0/releases/download/v0.30.0/lc0-v0.30.0-linux-cuda-x64.tar.gz
   tar -xzf lc0-v0.30.0-linux-cuda-x64.tar.gz
   ```

2. **Install to system**:
   ```bash
   sudo cp lc0-v0.30.0-linux-cuda-x64/lc0 /usr/local/bin/lc0
   sudo chmod +x /usr/local/bin/lc0
   ```

3. **Or install to user directory**:
   ```bash
   mkdir -p ~/.local/bin
   cp lc0-v0.30.0-linux-cuda-x64/lc0 ~/.local/bin/lc0
   chmod +x ~/.local/bin/lc0
   export PATH="$HOME/.local/bin:$PATH"  # Add to ~/.bashrc for permanent
   ```

### Option 2: Build from Source

```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y cmake build-essential libprotobuf-dev protobuf-compiler

# Clone and build
git clone https://github.com/LeelaChessZero/lc0.git
cd lc0
git submodule update --init --recursive
mkdir build
cd build
cmake ..
cmake --build . --config Release
sudo cp lc0 /usr/local/bin/
```

## Verify Installation

```bash
lc0 --help
```

You should see lc0 help output.

## Configure Django Settings (Optional)

Add to `settings.py`:

```python
# Path to lc0 executable (optional, will auto-detect)
LC0_PATH = "/usr/local/bin/lc0"  # or "/home/rajanand/.local/bin/lc0"
```

## Test Integration

```bash
cd digichess-backend
python manage.py test_maia
```

## Troubleshooting

- **lc0 not found**: Make sure it's in PATH or set `LC0_PATH` in settings
- **Permission denied**: Run `chmod +x /path/to/lc0`
- **CUDA errors**: Use CPU-only build if you don't have NVIDIA GPU



