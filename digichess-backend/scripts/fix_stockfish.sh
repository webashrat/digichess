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
    echo "📥 Downloading Stockfish 16 for x86_64 Linux..."
    cd /tmp
    rm -f stockfish_16_linux_x64_bmi2.zip
    wget -q https://github.com/official-stockfish/Stockfish/releases/download/sf_16/stockfish_16_linux_x64_bmi2.zip
    
    echo "📦 Extracting..."
    unzip -q -o stockfish_16_linux_x64_bmi2.zip
    
    echo "📋 Installing..."
    sudo cp stockfish_16_linux_x64_bmi2/stockfish "$STOCKFISH_PATH"
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

