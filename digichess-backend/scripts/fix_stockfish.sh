#!/bin/bash
# Script to fix Stockfish installation for x86_64 systems

set -e

STOCKFISH_PATH="/usr/local/bin/stockfish"
ARCH=$(uname -m)

echo "========================================="
echo "Stockfish Fix Script for $ARCH"
echo "========================================="
echo ""

# Check if Stockfish exists
if [ -f "$STOCKFISH_PATH" ]; then
    echo "⚠️  Existing Stockfish found at $STOCKFISH_PATH"
    echo "   File type: $(file "$STOCKFISH_PATH")"
    echo ""
    read -p "Do you want to backup and replace it? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo mv "$STOCKFISH_PATH" "${STOCKFISH_PATH}.backup.$(date +%s)"
        echo "✅ Backed up to ${STOCKFISH_PATH}.backup.*"
    else
        echo "❌ Aborted"
        exit 1
    fi
fi

# Determine download URL based on system
if [[ "$ARCH" == "x86_64" ]] || [[ "$ARCH" == "amd64" ]]; then
    echo "📥 Downloading Stockfish for x86_64 Linux..."
    cd /tmp
    rm -f stockfish-ubuntu-x86-64.tar
    STOCKFISH_LINUX_URL="${STOCKFISH_LINUX_URL:-https://sourceforge.net/projects/stockfish.mirror/files/sf_16.1/stockfish-ubuntu-x86-64.tar/download}"
    wget -q -O stockfish-ubuntu-x86-64.tar "$STOCKFISH_LINUX_URL"
    
    echo "📦 Extracting..."
    tar -xf stockfish-ubuntu-x86-64.tar
    
    echo "📋 Installing..."
    STOCKFISH_BIN="$(find /tmp -type f -name stockfish | head -1)"
    if [ -z "$STOCKFISH_BIN" ]; then
        echo "❌ Downloaded file doesn't contain expected binary"
        exit 1
    fi
    sudo cp "$STOCKFISH_BIN" "$STOCKFISH_PATH"
    sudo chmod +x "$STOCKFISH_PATH"
    
    echo "🧪 Testing..."
    if "$STOCKFISH_PATH" <<< "uci" | grep -q "uciok"; then
        echo "✅ Stockfish installed and working!"
        echo ""
        "$STOCKFISH_PATH" <<< "quit" > /dev/null 2>&1
    else
        echo "❌ Installation failed - Stockfish doesn't respond correctly"
        exit 1
    fi
    
    echo ""
    echo "✅ Installation complete!"
    echo "   Path: $STOCKFISH_PATH"
    echo "   Version: $(timeout 2 "$STOCKFISH_PATH" <<< "uci" 2>/dev/null | grep "id name" | head -1 || echo "Unknown")"
    
elif [[ "$ARCH" == "arm64" ]] || [[ "$ARCH" == "aarch64" ]]; then
    echo "📥 For ARM64, we need to compile from source..."
    echo "   This script will download and compile Stockfish"
    cd /tmp
    rm -rf Stockfish
    git clone --depth 1 https://github.com/official-stockfish/Stockfish.git
    cd Stockfish/src
    make -j$(nproc) ARCH=apple-silicon || make -j$(nproc)
    sudo cp stockfish "$STOCKFISH_PATH"
    sudo chmod +x "$STOCKFISH_PATH"
    echo "✅ Stockfish compiled and installed!"
else
    echo "❌ Unsupported architecture: $ARCH"
    echo "   Please compile Stockfish from source for your architecture"
    exit 1
fi

