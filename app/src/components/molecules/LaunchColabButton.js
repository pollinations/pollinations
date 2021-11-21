import {Button} from '@material-ui/core'
import { useEffect, useState } from 'react';
import { pollinatorColabURL } from '../../data/globals';


const LaunchColabButton = ({ connected }) => {

    const [loading ,setLoading ] = useState(false)

    useEffect(()=>{
        if (connected) setLoading(false)

    },[connected])

    // Connected should be null right after connecting to a node but before a heartbeat has been received
    // In typescript we'd use an enum type but here we use: null (unknown), false (disconnected) and true (connected)

    if (connected === null)
        return  <Button disabled children='Waiting for GPU...'/>

    if (connected === false)
        return  <Button 
            onClick={()=>setLoading(true)}
            color="secondary" 
            href={pollinatorColabURL} 
            target="colab">
            {loading ? 'Waiting for connection...' : '[ Launch GPU ]'}
        </Button>

    return <Button disabled children='Connected to GPU'/>
}

export default LaunchColabButton