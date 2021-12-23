import { useEffect, useState } from "react"
import { subscribeCID } from "../network/ipfsPubSub"


export default (topic, suffix="") => {

    const [cid, setCid] = useState(null)
    useEffect(() => subscribeCID(topic, suffix, setCid), [topic, suffix])

    return cid
}