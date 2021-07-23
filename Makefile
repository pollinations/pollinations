.PHONY: init up dev clean debug
init:
	docker-compose up
up:
	cp docker/local_ipfs/config.json tmp/ipfs/config
	docker-compose up -d
dev:
	cd app && yarn start
down:
	docker-compose down
debug-docker:
	cp ./docker/local_ipfs/config.json ./tmp/ipfs/config
	docker-compose up 
