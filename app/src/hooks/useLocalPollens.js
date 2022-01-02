import { useCallback } from "react";
import useIPFS from "./useIPFS";
import useLocalStorage from "./useLocalStorage";
import usePollenDone from "./usePollenDone";


export default function useLocalPollens( node ){

    const [ pollens, setPollens ] = useLocalStorage('pollens', [])
    const ipfs = useIPFS(node.contentID)

    const pushCID = useCallback( value => {
        let isPresent = pollens.find( pollen => pollen.cid === value)
        if (isPresent) return 
        setPollens( pollens => [ ...pollens, { date: new Date(), cid: value} ])

    }, [pollens])

    const popCID = cid => setPollens( pollens => pollens.filter( pollen => pollen.cid !== cid) )

    usePollenDone(ipfs, ipfs => {
        pushCID(ipfs[".cid"])
    })

    return { pollens, pushCID, popCID }
}