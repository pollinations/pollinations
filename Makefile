.PHONY: init up dev clean debug
init:
	docker-compose -f ipfs-init.yml up
up:
	cp docker/ipfs/config.json tmp/ipfs/config
	docker-compose --remove-orphans up -d
dev:
	cd app && yarn start
down:
	docker-compose down
debug-docker:
	cp ./docker/ipfs/config.json ./tmp/ipfs/config
	docker-compose --remove-orphans up 
clean:
	rm -rf tmp