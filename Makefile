.PHONY: help install build test lint format clean dev dev-logs dev-stop dev-restart tmos-up tmos-down tmos-status tmos-api-smoke

help:
	@echo "TeleMab Broadcast Platform - Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install        Install dependencies"
	@echo "  make build          Build all services"
	@echo ""
	@echo "Development:"
	@echo "  make dev            Start development stack"
	@echo "  make tmos-up        Start TMOS app stack (frontend + backend + postgres + livekit)"
	@echo "  make tmos-status    Check TMOS app stack status"
	@echo "  make tmos-api-smoke Validate all registered /api routes"
	@echo "  make tmos-down      Stop TMOS app stack"
	@echo "  make dev-logs       View development logs"
	@echo "  make dev-stop       Stop development stack"
	@echo "  make dev-restart    Restart development stack"
	@echo ""
	@echo "Testing & Quality:"
	@echo "  make test           Run all tests"
	@echo "  make lint           Lint all code"
	@echo "  make format         Format all code"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean          Clean build artifacts"
	@echo "  make status         Check service status"

install:
	@echo "Installing dependencies..."
	npm install

build:
	@echo "Building all services..."
	npm run build:all

test:
	@echo "Running tests..."
	npm test

lint:
	@echo "Linting code..."
	npm run lint:all

format:
	@echo "Formatting code..."
	npm run format:all

clean:
	@echo "Cleaning build artifacts..."
	npm run clean:all || true
	find . -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true

dev:
	@echo "Starting development stack..."
	docker-compose -f docker-compose.dev.yml up -d
	@echo "Waiting for services to be ready..."
	@sleep 5
	@make status

dev-logs:
	docker-compose -f docker-compose.dev.yml logs -f

dev-stop:
	@echo "Stopping development stack..."
	docker-compose -f docker-compose.dev.yml down

dev-restart: dev-stop dev
	@echo "Development stack restarted"

tmos-up:
	bash ./ops/dev-up.sh

tmos-down:
	bash ./ops/dev-down.sh

tmos-status:
	bash ./ops/dev-status.sh

tmos-api-smoke:
	bash ./ops/api-smoke.sh

status:
	@echo "Service Status:"
	@echo ""
	@echo "Auth Service: $$(curl -s http://localhost:3001/health | jq -r '.status' || echo 'DOWN')"
	@echo "Prometheus: $$(curl -s http://localhost:9090/-/healthy | jq -r '.status' || echo 'DOWN')"
	@echo "Grafana: $$(curl -s http://localhost:3000/api/health | jq -r '.status' || echo 'DOWN')"
	@echo "PostgreSQL: $$(docker exec tmos-postgres pg_isready -U telemab 2>/dev/null | grep accepting && echo 'UP' || echo 'DOWN')"
	@echo "Redis: $$(docker exec tmos-redis redis-cli ping 2>/dev/null || echo 'DOWN')"
	@echo "RabbitMQ: $$(curl -s http://guest:guest@localhost:15672/api/aliveness-test/% | jq -r '.status' || echo 'DOWN')"
	@echo ""

db-shell:
	docker exec -it tmos-postgres psql -U telemab -d telemab

redis-cli:
	docker exec -it tmos-redis redis-cli

rabbitmq-shell:
	docker exec -it tmos-rabbitmq bash

auth-service-dev:
	npm --workspace=auth-service run dev

auth-service-test:
	npm --workspace=auth-service test

all: install build test
	@echo "✅ Everything is ready!"
