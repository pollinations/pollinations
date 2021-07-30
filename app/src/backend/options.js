import { program } from "commander";

program
.option('-p, --path <path>', 'local folder to synchronize', '/tmp/ipfs')
.option('-r, --receive', 'only receive state', false)
.option('-s, --send', 'only send state', false)
.option('-o, --once', 'run once and exit', false)
.option('-i, --ipns', 'publish to /ipns/pollinations.ai', false)
.option('-n, --nodeid <nodeid>', 'local node id', null)
.option('-d, --debounce <ms>', 'file watch debounce time', 1500)
.option('-e, --execute <command>', 'run command on receive and stream back to ipfs', null)

program.parse(process.argv);

export default program.opts();