import Debug from "debug"
import { useEffect, useState } from "react"
import readMetadata from "../utils/notebookMetadata"

const debug = Debug("hooks/useNotebookMetadata")

const useNotebookMetadata = (ipfs) => {
    const [metadata, setMetadata] = useState(null)
    useEffect(() => {
        (async () => {
            const notebookURL = ipfs?.input && ipfs.input["notebook.ipynb"]
            if (!notebookURL) return
            // get notebookJSON from url
            const response = await fetch(notebookURL);
            const notebookJSON = await response.json();
            debug("got notebook json", notebookJSON)  
            setMetadata(readMetadata(notebookJSON))
        })()
    }, [ipfs])
    return metadata
}

export default useNotebookMetadata