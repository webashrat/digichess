# lc0 Installation Options

## ⚠️ Important Note

**The system works perfectly WITHOUT lc0!** It will automatically use Stockfish for all bots. Installing lc0 is optional and only enables Maia (human-like play) for bots rated 800-1900.

## Option 1: Build from Source (Recommended for Linux)

Since pre-built Linux binaries may not be available in recent releases, building from source is the most reliable option:

```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y cmake build-essential libprotobuf-dev protobuf-compiler libopenblas-dev

# Clone repository
git clone https://github.com/LeelaChessZero/lc0.git
cd lc0
git submodule update --init --recursive

# Build
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
cmake --build . --config Release -j$(nproc)

# Install
sudo cp lc0 /usr/local/bin/
# OR install to user directory:
mkdir -p ~/.local/bin
cp lc0 ~/.local/bin/
chmod +x ~/.local/bin/lc0
export PATH="$HOME/.local/bin:$PATH"
```

## Option 2: Use Docker (Alternative)

If building from source is difficult, you can use Docker:

```bash
docker pull leelachesszero/lc0:latest
# Then modify maia_integration.py to use docker exec
```

## Option 3: Skip lc0 (Current Setup)

**This is perfectly fine!** The system will:
- Use Stockfish for ALL bots (800-2500)
- Work immediately without any additional setup
- Provide strong, consistent play

Maia integration is a nice-to-have enhancement, not a requirement.

## Testing

After installation (if you choose to install):

```bash
cd digichess-backend
python manage.py test_maia
```

## Current Status

✅ **Maia models**: Downloaded and ready  
✅ **Integration code**: Complete with fallback  
⏳ **lc0 engine**: Optional - system works without it  


