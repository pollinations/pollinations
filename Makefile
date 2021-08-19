.PHONY: init up dev clean debug
init:
	docker-compose -f ipfs-init.yml up
up:
	cp docker/ipfs/config.json tmp/ipfs/config
	docker-compose up --remove-orphans -d
dev:
	cd app && yarn install && yarn start
down:
	docker-compose down
debug-docker:
	cp ./docker/ipfs/config.json ./tmp/ipfs/config
	docker-compose up --remove-orphans
clean:
	rm -rf tmp
