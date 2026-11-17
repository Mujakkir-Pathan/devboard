# .env holds the host port numbers used by compose; load them for `make smoke`.
-include .env
BACKEND_HOST_PORT ?= 8081
FRONTEND_HOST_PORT ?= 8080
AI_HOST_PORT ?= 3005

help:
	@echo ""
	@echo "DevBoard commands:"
	@echo "  make setup   create your .env file (first time only)"
	@echo "  make up      build and start everything"
	@echo "  make down    stop everything"
	@echo "  make logs    watch the logs"
	@echo "  make ps      show what is running"
	@echo "  make reset   wipe the database and start fresh"
	@echo "  make smoke   quick check that everything works"
	@echo ""

setup:
	@test -f .env || cp .env.example .env
	@echo ".env is ready"

up: setup
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

reset:
	docker compose down -v
	docker compose up --build

smoke:
	@echo "backend health:"
	curl -s http://localhost:$(BACKEND_HOST_PORT)/health
	@echo ""
	@echo "ai-service health:"
	curl -s http://localhost:$(AI_HOST_PORT)/health
	@echo ""
	@echo "frontend page:"
	curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:$(FRONTEND_HOST_PORT)/
	@echo "tasks from the database:"
	curl -s "http://localhost:$(FRONTEND_HOST_PORT)/api/tasks?project_id=1"
	@echo ""

.PHONY: help setup up down logs ps reset smoke
