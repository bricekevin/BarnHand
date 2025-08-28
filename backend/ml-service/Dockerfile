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
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Development image
FROM python-deps as development
WORKDIR /app

# Install development dependencies
RUN pip install --no-cache-dir -r requirements-dev.txt

# Copy source code
COPY . .

# Create non-root user
RUN groupadd --system --gid 1001 python
RUN useradd --system --uid 1001 --gid python mlservice

# Create directories and set permissions
RUN mkdir -p /app/chunks /models
RUN chown -R mlservice:python /app /models
USER mlservice

# Expose port
EXPOSE 8002
ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

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

# Create non-root user
RUN groupadd --system --gid 1001 python
RUN useradd --system --uid 1001 --gid python mlservice

# Create directories and set permissions
RUN mkdir -p /app/chunks /models
RUN chown -R mlservice:python /app /models
USER mlservice

# Expose port
EXPOSE 8002
ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1
ENV ENVIRONMENT=production

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