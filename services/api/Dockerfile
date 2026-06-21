FROM python:3.12-slim AS wheel-builder

WORKDIR /build
COPY services/api/requirements.txt .
RUN apt-get update \
    && apt-get install --yes --no-install-recommends build-essential \
    && pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt \
    && rm -rf /var/lib/apt/lists/*

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ARTIFACT_ROOT=/data/artifacts

WORKDIR /app
COPY services/api/requirements.txt .
COPY --from=wheel-builder /wheels /wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt \
    && rm -rf /wheels
COPY services/api/app ./app
COPY schemas ./schemas
RUN mkdir -p /data/artifacts
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
