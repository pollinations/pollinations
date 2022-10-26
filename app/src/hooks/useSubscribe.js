import { subscribeCID } from "@pollinations/ipfs/ipfsPubSub"
import { useEffect, useState } from "react"

export default (topic, suffix="") => {

    const [cid, setCid] = useState(null)
    useEffect(() => subscribeCID(topic, suffix, setCid), [topic, suffix])

    return cid
}