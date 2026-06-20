.PHONY: dev api web test install

install:
	npm install
	python3 -m venv .venv
	.venv/bin/pip install -r services/api/requirements.txt

api:
	.venv/bin/uvicorn app.main:app --reload --app-dir services/api --port 8000

web:
	npm run dev

test:
	.venv/bin/pytest services/api/tests
	npm run build

dev:
	docker compose up --build

