.PHONY: up
up:
	docker-compose up -d
.PHONY: dev
dev:
	cd app && yarn start
.PHONY: clean
down:
	docker-compose down