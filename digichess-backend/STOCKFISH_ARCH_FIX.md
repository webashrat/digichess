# Fixing Stockfish "Exec format error" on Dev

## Problem

You're getting:
```
Stockfish analysis failed: Failed to start Stockfish engine: [Errno 8] Exec format error: '/usr/local/bin/stockfish'
```

## Root Cause

This error means the Stockfish binary was compiled for a different CPU architecture than your dev machine. For example:
- Binary compiled for x86-64, but your machine is ARM (M1/M2 Mac)
- Binary compiled for ARM, but your machine is x86-64

## Solutions

### Option 1: Download Pre-built Binary (Recommended)

1. **Check your system architecture:**
   ```bash
   uname -m
   # Output: x86_64 (Intel) or arm64 (Apple Silicon)
   ```

2. **Download the correct binary:**
   
   **For x86_64 (Intel/Linux):**
   ```bash
   cd /tmp
   wget https://github.com/official-stockfish/Stockfish/releases/download/sf_16/stockfish_16_linux_x64_bmi2.zip
   unzip stockfish_16_linux_x64_bmi2.zip
   sudo cp stockfish_16_linux_x64_bmi2/stockfish /usr/local/bin/stockfish
   sudo chmod +x /usr/local/bin/stockfish
   ```
   
   **For ARM64 (Apple Silicon Mac):**
   ```bash
   cd /tmp
   wget https://github.com/official-stockfish/Stockfish/releases/download/sf_16/stockfish_16_src.zip
   unzip stockfish_16_src.zip
   cd Stockfish/src
   make -j$(sysctl -n hw.ncpu) ARCH=apple-silicon
   sudo cp stockfish /usr/local/bin/stockfish
   sudo chmod +x /usr/local/bin/stockfish
   ```

   **For x86_64 macOS:**
   ```bash
   cd /tmp
   wget https://github.com/official-stockfish/Stockfish/releases/download/sf_16/stockfish_16_src.zip
   unzip stockfish_16_src.zip
   cd Stockfish/src
   make -j$(sysctl -n hw.ncpu)
   sudo cp stockfish /usr/local/bin/stockfish
   sudo chmod +x /usr/local/bin/stockfish
   ```

### Option 2: Compile from Source

1. **Navigate to Stockfish directory:**
   ```bash
   cd digichess-backend/Stockfish/src
   ```

2. **Compile for your architecture:**
   
   **For ARM64 (Apple Silicon):**
   ```bash
   make -j$(sysctl -n hw.ncpu) ARCH=apple-silicon
   ```
   
   **For x86_64 (Intel):**
   ```bash
   make -j$(nproc) ARCH=x86-64-modern
   ```
   
   **For Linux x86_64:**
   ```bash
   make -j$(nproc) ARCH=x86-64-modern COMP=gcc
   ```

3. **Install:**
   ```bash
   sudo cp stockfish /usr/local/bin/stockfish
   sudo chmod +x /usr/local/bin/stockfish
   ```

### Option 3: Use Docker (If running locally)

If you're running the backend in Docker locally, the binary should work fine since Docker handles the architecture. Make sure you're not trying to run a Docker-built binary directly on your host machine.

## Verify Installation

After installing, test it:

```bash
stockfish
```

You should see:
```
Stockfish 16 by the Stockfish developers (see AUTHORS file)

uci
```

Type `quit` to exit.

## Quick Fix for Dev

The easiest solution is to download a pre-built binary for your architecture from the official releases:

1. Go to: https://github.com/official-stockfish/Stockfish/releases
2. Download the appropriate binary for your OS/architecture
3. Extract and copy to `/usr/local/bin/stockfish`
4. Make it executable: `chmod +x /usr/local/bin/stockfish`

## Note

The Dockerfile compiles Stockfish for `x86-64-modern`. If your dev machine is ARM-based (like M1/M2 Mac), you need a separate binary compiled for ARM.

