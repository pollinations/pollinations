.PHONY: up
up:
	docker-compose up -d
.PHONY: dev
dev:
	cd app && DEBUG=* yarn start
.PHONY: clean
down:
	docker-compose down