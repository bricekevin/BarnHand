# Multi-stage build for ML Service with GPU support
FROM python:3.11-slim as base

# System dependencies
FROM base as system-deps
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    ffmpeg \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libglib2.0-0 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
FROM system-deps as python-deps
WORKDIR /app

# Copy requirements
COPY requirements.txt ./
COPY requirements-dev.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir numpy cython

# Install xtcocotools separately (needs numpy at build time)
RUN pip install --no-cache-dir --no-build-isolation xtcocotools==1.14.3 || \
    pip install --no-cache-dir pycocotools

# Install all dependencies (includes torch, which mim needs to detect version)
RUN pip install --no-cache-dir -r requirements.txt

# Install mmcv-full with compiled extensions
# mim install on ARM64 gets mmcv-lite without extensions, so we MUST build from source
# FORCE_CUDA=0 ensures CPU-only build, MMCV_WITH_OPS=1 compiles C++ extensions
ENV FORCE_CUDA=0
ENV MMCV_WITH_OPS=1
# Install build dependencies for C++ extension compilation
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir ninja
# Install mmcv dependencies first (mmengine, addict, yapf)
RUN pip install --no-cache-dir mmengine addict yapf
# Build from source with setup.py to compile C++ ops - this WILL compile extensions
# This takes ~15-20 min on ARM64 but is REQUIRED for MMPose to work
RUN git clone --depth 1 --branch v2.1.0 https://github.com/open-mmlab/mmcv.git /tmp/mmcv && \
    cd /tmp/mmcv && \
    MMCV_WITH_OPS=1 FORCE_CUDA=0 python setup.py develop && \
    rm -rf /tmp/mmcv/.git

# Install mmpose without dependencies to skip chumpy (broken setup.py, only needed for SMPL models)
RUN pip install --no-cache-dir --no-deps mmpose==1.2.0

# Development image
FROM python-deps as development
WORKDIR /app

# Install development dependencies
RUN pip install --no-cache-dir -r requirements-dev.txt

# Copy source code
COPY . .

# Create non-root user with home directory
RUN groupadd --system --gid 1001 python
RUN useradd --system --uid 1001 --gid python --create-home mlservice

# Create directories and set permissions
RUN mkdir -p /app/chunks /models /tmp/matplotlib /tmp/ultralytics /tmp/huggingface
RUN chown -R mlservice:python /app /models /tmp/matplotlib /tmp/ultralytics /tmp/huggingface
USER mlservice

# Expose port
EXPOSE 8002
ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1
ENV MPLCONFIGDIR=/tmp/matplotlib
ENV YOLO_CONFIG_DIR=/tmp/ultralytics
ENV HF_HOME=/tmp/huggingface
ENV TRANSFORMERS_CACHE=/tmp/huggingface

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8002/health || exit 1

# Start development server
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8002", "--reload"]

# Production image
FROM python-deps as production
WORKDIR /app

# Copy only necessary files
COPY src/ ./src/
COPY pyproject.toml ./

# Create non-root user with home directory
RUN groupadd --system --gid 1001 python
RUN useradd --system --uid 1001 --gid python --create-home mlservice

# Create directories and set permissions
RUN mkdir -p /app/chunks /models /tmp/matplotlib /tmp/ultralytics /tmp/huggingface
RUN chown -R mlservice:python /app /models /tmp/matplotlib /tmp/ultralytics /tmp/huggingface
USER mlservice

# Expose port
EXPOSE 8002
ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1
ENV ENVIRONMENT=production
ENV MPLCONFIGDIR=/tmp/matplotlib
ENV YOLO_CONFIG_DIR=/tmp/ultralytics
ENV HF_HOME=/tmp/huggingface
ENV TRANSFORMERS_CACHE=/tmp/huggingface

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8002/health || exit 1

# Start production server
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "1"]

# GPU-enabled production image
FROM production as gpu-production

# Install CUDA support (if needed)
RUN pip install --no-cache-dir \
    torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Same configuration as production
ENV CUDA_VISIBLE_DEVICES=0
ENV ML_DEVICE=cuda