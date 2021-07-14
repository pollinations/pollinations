## Pollinations

- Frontend: https://pollinations.ai/
- Instructions: [docs/instructions.md](docs/instructions.md)

[Thoughts and future directions](docs/Pollinations%209bc30012e1a04f94b4d6f045629f0631.md) by [gyokaykucuk](https://github.com/gokaykucuk) 

### TODO (a little outdated)
- [x] unidirectional communication from colab notebook to browser (DONE)
- [x] check for new media files each time a new line is printed to stdout (SUPERSEDED)
- [x] send media files as they are created (DONE)
- [x] deploy to Github Pages (SUPERSEDED by Netlify)
- [x] determine if its possible to programatically run a colab notebook from the start (using paperspace for now)
- [x] finish a minimal implementation in the deep-daze or latentvision colab notebook which allows adjusting parameters and triggering the training
- [x] extract the python code from the notebook to the python package (may not be necessary as most of the syncronization stuff is node-based)
- [ ] Colab should only send contentID of /output to pollinations and pollinations should just send contentID of /input to colab
- [ ] Implement proper unidirectional dataflow (pollinations writes to /input, colab reads from /input and continuously outputs results to /output)
- [ ] test IPFS persistence and distributiuon of results (use pinning for results that are a finished run)
- [ ] convert a few colab notebooks

![FSM](fsm.svg)
