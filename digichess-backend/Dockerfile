# Multi-stage build for Django backend with Stockfish and lc0
FROM python:3.11-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    make \
    cmake \
    git \
    wget \
    ca-certificates \
    libprotobuf-dev \
    protobuf-compiler \
    libopenblas-dev \
    meson \
    ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /build

# Copy Stockfish source code
COPY Stockfish /build/Stockfish

# Build Stockfish
RUN cd Stockfish/src && \
    make -j$(nproc) ARCH=x86-64-modern COMP=gcc && \
    mv stockfish /usr/local/bin/stockfish && \
    chmod +x /usr/local/bin/stockfish && \
    stockfish bench > /dev/null 2>&1 || true

# Optionally build lc0 (for Maia support)
# This is optional - the system works without it using Stockfish
# Create a placeholder first, then try to build and replace it
RUN echo '#!/bin/bash\necho "lc0 not available - Maia features disabled"' > /usr/local/bin/lc0 && \
    chmod +x /usr/local/bin/lc0

# Try to build lc0 - if it fails, the placeholder remains
RUN (git clone --depth 1 --branch release/0.32 https://github.com/LeelaChessZero/lc0.git /build/lc0 && \
    cd /build/lc0 && \
    git submodule update --init --recursive && \
    meson setup build/release --buildtype release && \
    cd build/release && \
    ninja && \
    cp lc0 /usr/local/bin/lc0 && \
    chmod +x /usr/local/bin/lc0) || echo "lc0 build skipped - using placeholder (system works without it)"

# Final stage - runtime
FROM python:3.11-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libprotobuf-dev \
    libopenblas0 \
    && rm -rf /var/lib/apt/lists/*

# Copy Stockfish and lc0 from builder
COPY --from=builder /usr/local/bin/stockfish /usr/local/bin/stockfish
COPY --from=builder /usr/local/bin/lc0 /usr/local/bin/lc0

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Django application
COPY . .

# Copy entrypoint script
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy startup script for running all services
COPY docker-start-all.sh /start-all.sh
RUN chmod +x /start-all.sh

# Create directories for media, static files, and Maia models
RUN mkdir -p /app/media /app/staticfiles /app/games/maia_models /app/media/bots

# Copy bot profile pictures
COPY DIGIBOT.jpg /app/media/bots/digibot.jpg
RUN chmod 644 /app/media/bots/digibot.jpg

# Set environment variables for chess engines
ENV STOCKFISH_PATH=/usr/local/bin/stockfish
ENV LC0_PATH=/usr/local/bin/lc0
ENV MAIA_MODELS_DIR=/app/games/maia_models
ENV PYTHONUNBUFFERED=1

# Expose port (Daphne for ASGI/WebSocket support)
EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]

# Default command - run Daphne (ASGI server for WebSocket support)
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]

