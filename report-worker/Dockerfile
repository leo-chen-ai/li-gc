FROM docker.m.daocloud.io/library/python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CHROMIUM_BINARY=/usr/bin/chromium \
    CHROMEDRIVER_BINARY=/usr/bin/chromedriver \
    REPORT_FORWARD_LOCAL_STORAGE=/data/artifacts

RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i \
          -e 's|deb.debian.org/debian|mirrors.aliyun.com/debian|g' \
          -e 's|security.debian.org/debian-security|mirrors.aliyun.com/debian-security|g' \
          /etc/apt/sources.list.d/debian.sources; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium chromium-driver fonts-noto-cjk libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir \
      --index-url https://pypi.tuna.tsinghua.edu.cn/simple \
      -r requirements.txt

COPY report_worker ./report_worker
COPY legacy ./legacy
COPY assets ./assets

RUN useradd --create-home --uid 10001 worker \
    && mkdir -p /data/artifacts \
    && chown -R worker:worker /app /data

USER worker
CMD ["python", "-m", "report_worker.main"]
