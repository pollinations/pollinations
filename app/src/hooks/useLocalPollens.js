import Debug from "debug"
import { values } from "ramda"
import { useCallback } from "react"
import useIPFS from "./useIPFS"
import useIPFSWrite from "./useIPFSWrite"
import useLocalStorage from "./useLocalStorage"
import usePollenDone from "./usePollenDone"

const debug = Debug("useLocalPollens")

// an empty folder
const EMPTY_CID = "QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn"

export default function useLocalPollens( node ) {

    const [ pollensCID, setPollensCID ] = useLocalStorage('localpollens', EMPTY_CID)
   
    const currentNodeContent = useIPFS(node.contentID)

    const pollens = useIPFS(pollensCID)

    debug("pollens", pollens)
    
    const writer = useIPFSWrite(pollensCID)
    
    const pushCID = useCallback(async cid => {
        let isPresent = values(pollens).find( pollen => pollen[".cid"] === cid)
        if (isPresent) return 
        
        const path = (new Date()).toISOString().replace(/[\W_]+/g, "_")
        const newCID = await writer.cp(path, cid)
        setPollensCID(newCID)

    }, [pollens, writer])

    const popCID = useCallback(async cid => {
        const [path, _] = Object.entries(pollens).find(([path, pollen]) => pollen[".cid"] === cid)
        const newCID = await writer.rm(path)
        setPollensCID(newCID)
    }, [pollens, writer])

    usePollenDone(currentNodeContent, ipfs => {
        debug("pollen done. Pushing CID", ipfs[".cid"])
        pushCID(ipfs[".cid"])
    })

    // pushCID(currentNodeContent[".cid"])

    return { pollens, pushCID, popCID }
}