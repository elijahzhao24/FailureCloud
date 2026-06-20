FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ARTIFACT_ROOT=/data/artifacts

WORKDIR /app
COPY services/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/api/app ./app
COPY schemas ./schemas
RUN mkdir -p /data/artifacts
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

