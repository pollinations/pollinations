## 🌸 Pollinations

Pollinations is an effort to make generative art more approachable. There are three main components.
- A React frontend
- IPFS for pubsub and storage
- Notebooks running on Google Collab to use the free cloud GPUs

## 🔗 Links

- Frontend: https://pollinations.ai/
- Instructions: [docs/instructions.md](docs/instructions.md)

## �👩‍💻 Development
<details>
  <summary>Development of Pollinations.AI Web App</summary>

    Enable logging:
    `localStorage.debug = "*"`

    You can start the makefile on the root project for managing your environment.

    `make dev` to start the development server of web app.% 

    ## Optionally it is possible to develop with a local IPFS node
    
    Enable connect to local IPFS:
    `localStorage.localIFS = true

    `make up` to start the releant services. See next section for details
  
</details>

<details>
  <summary>Development with Local IPFS node</summary>

    Development environment requires `docker` & `docker-compose` for running a loca IPFS node. For docker installation, please navigate to https://docs.docker.com/get-docker/.

    After docker is setup, `make` is used for managing the IPFS and development environment.

    ## 🟡 Initialization

    To run pollinations development environment first time,

    - Run `make init`, this will initialize start the IPFS docker image and fill `tmp/ipfs` folder by migrating IPFS.

    ## 🟢 Running

    After IPFS migrated, to start development environment,
    - Run `make up`, this will start the dockerized IPFS instance and detach.
    - Run `make dev` to start the react application living under `/app`

    ## 🔴 Stopping

    - Run `make down` to stop running IPFS instance.
    - Run `make clean` to remove the `tmp` folder and its contents.

    ## ⚙️ Configuration

    IPFS configuration can be found and updated in `docker/ipfs/config.json`. Every time the docker containers are started, the config file under `tmp/ipfs/config` is overwritten with this json file.

</details>


<details>
  <summary>Architecture Diagram</summary>

  The following diagram has an editable copy embedded. Use https://draw.io/#Hpollinations/pollinations/master/pollinations_architecture.png to edit the file.

  Export the results as PNG with "Include a copy of my diagram" option selected and replace the current diagram.

  ![Architecture Diagram](pollinations_architecture.png)
  
 </details>

