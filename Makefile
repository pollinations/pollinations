.PHONY: up
up:
	docker-compose up -d
	cd app && yarn start
.PHONY: clean
down:
	docker-compose down