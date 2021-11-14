import {Button} from '@material-ui/core'
import { useEffect, useState } from 'react';

export const pollinatorColabURL = "https://colab.research.google.com/github/pollinations/pollinations/blob/seedling/colabs/pollinator.ipynb";

const LaunchColabButton = ({ connected }) => {

    const [loading ,setLoading ] = useState(false)

    useEffect(()=>{
        if (connected) setLoading(false)

    },[connected])

    return !connected ? <Button 
        onClick={()=>setLoading(true)}
        color="secondary" 
        href={pollinatorColabURL} 
        target="colab">
        {loading ? 'Launching...' : '[ Launch Colab ]'}
    </Button> : <Button disabled children='Connected to GPU'/>
}

export default LaunchColabButton