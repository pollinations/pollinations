
import awaitSleep from "await-sleep"
import chokidar from "chokidar"
import Debug from 'debug'
import { uniqBy } from "ramda"

const debug = Debug("fileWatcher")

async function* chunkedFilewatcher({ path, debounce, signal }) {
    debug("Local: Watching", path)

    const watcher = chokidar.watch(path, {
        awaitWriteFinish: {
            stabilityThreshold: debounce,
            pollInterval: debounce / 2
        },
        ignored: /(^|[\/\\])\../,
        cwd: path,
        interval: debounce,
    })


    let changeQueue = []

    debug("registering watcher for path", path)
    watcher.on("all", async (event, path) => {

        debug("got watcher event", event, path)

        if (path !== '') {
            changeQueue.push({ event, path })
            //debug("Queue", changeQueue)
        }
    })
    debug("signal", signal)
    while (!signal.aborted) {
        const files = changeQueue
        changeQueue = []
        if (files.length > 0) {
            const deduplicatedFiles = deduplicateChangedFiles(files)
            debug("Pushing to channel:", deduplicatedFiles)
            yield deduplicatedFiles
            debug("Yielded files. Sleeping")
        }

        // the use of debounce is not quite right here. Will change later
        // debug("Sleeping", debounce, signal.aborted)
        await awaitSleep(debounce)
    }
    // yield []
    debug("fileWatcher aborted. closing watcher")
    watcher.removeAllListeners()
    watcher.unwatch(path)
    await watcher.close()
    debug("closed filewatcher")
}


const deduplicateChangedFiles = (changed) =>
    uniqBy(({ event, path }) => `${event}-${path}`, changed)


export default chunkedFilewatcher