import { useCallback, useEffect } from "react";
import useIPFS from "./useIPFS";
import useLocalStorage from "./useLocalStorage";


export default function useLocalPollens( node ){

    const [ pollens, setPollens ] = useLocalStorage('pollens', [])
    const ipfs = useIPFS(node.contentID)

    const pushCID = useCallback( value => {
        let isPresent = pollens.find( pollen => pollen.cid === value)
        if (isPresent) return 
        setPollens( pollens => [ ...pollens, { date: new Date(), cid: value} ])

    }, [pollens])

    const popCID = cid => setPollens( pollens => pollens.filter( pollen => pollen.cid !== cid) )



    useEffect(()=>{
        console.log('fx')
        if (!ipfs?.output?.done) return 
        if (!node.contentID) return
        pushCID(node.contentID)

    },[node.contentID, ipfs?.output?.done, pushCID])

    return { pollens, pushCID, popCID }
}