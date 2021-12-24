
import Debug from 'debug'
import { existsSync } from 'fs'
import { join } from 'path'
import chunkedFilewatcher from '../fileWatcher'
const debug = Debug("senderLight")


export default async function* folderSync({ writer, path, debounce, signal }) {

    const { addFile, mkDir, rm, cid } = writer

    debug("start consuming watched files")

    if (!existsSync(path)) {
        debug("Local: Root directory does not exist. Creating", path)
        mkdirSync(path, { recursive: true })
    }

    const fileChanges$ = chunkedFilewatcher({ path, debounce, signal })



    for await (const changed of fileChanges$) {

        debug("Changed files", changed)

        for (const { event, path: file } of changed) {
            //await Promise.all(lastChanged.map(async ({ event, path: file }) => {

            // Using sequential loop for now just in case parallel is dangerous with Promise.ALL
            debug("Local:", event, file);
            const localPath = join(path, file)
            const ipfsPath = file

            if (event === "addDir") {
                debug("mkdir", ipfsPath)
                await mkDir(ipfsPath)
            }

            if (event === "add" || event === "change") {
                debug("adding", ipfsPath, localPath)
                await addFile(ipfsPath, localPath)
            }

            if (event === "unlink" || event === "unlinkDir") {
                debug("removing", file, event)
                await rm(ipfsPath)
            }
        }

        const newContentID = await cid()

        yield newContentID

    }

}




