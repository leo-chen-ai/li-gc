# syntax=docker/dockerfile:1
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app.py download_models.sh ./
RUN chmod +x download_models.sh

# 本地已有模型时直接带入镜像（models/*.onnx 不进 Git，由 .gitignore 排除）；
# 构建环境没有模型时回退到构建期下载。
COPY models ./models
ARG DOWNLOAD_MODELS=true
RUN if [ "$DOWNLOAD_MODELS" = "true" ]; then ./download_models.sh || true; fi

ENV FACE_MODEL_DIR=/app/models \
    FACE_DATA_DIR=/data/faces \
    FACE_SERVICE_PORT=7100

VOLUME ["/data/faces"]
EXPOSE 7100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:7100/health || exit 1

CMD ["gunicorn", "-w", "1", "-b", "0.0.0.0:7100", "--timeout", "120", "app:app"]
