import { useEffect, useMemo, useState } from "react"
import useIPFS from "../hooks/useIPFS"
import Typography from "@material-ui/core/Typography"
import { getNotebookMetadata } from "../utils/notebookMetadata"
import { mediaToDisplay } from "../data/media"
import { Box, Button, Link, List, ListItem } from "@material-ui/core"
import useLocalStorage from "../hooks/useLocalStorage"
import useLocalPollens from "../hooks/useLocalPollens"

const LocalPollens = ({node}) => {
    
    const { pollens, pushCID } = useLocalPollens(node)  

    return <>
    <Box margin='5em 0'>
      
        
            <Box display='grid' gridGap='5em' gridTemplateColumns='repeat(auto-fill, minmax(300px, 1fr))'>
                {   
                   
                    pollens?.map( pollen => <EachPollen cid={pollen.cid}/>)
                }
            </Box>
            
            
      
    </Box>
    
    </>
}

const EachPollen = cid => {
    console.log(cid)

    const ipfs = useIPFS(cid)

    const { first } = useMemo(() => {
        return mediaToDisplay(ipfs.output);
      }, [ipfs.output]);

      console.log(ipfs)

    const metadata = getNotebookMetadata(ipfs);

    const primaryInputField = metadata?.primaryInput;
    const primaryInput = ipfs?.input?.[primaryInputField];

    return <Box key={cid} display='grid' gridGap='2em' gridTemplateColumns='repeat(auto-fill, minmax(300px, 1fr))'>

                <Box gridColumnStart={1} gridColumnEnd={3} >
                    <Typography>
                        {primaryInput}
                    </Typography>
                    <Typography style={{textOverflow: 'elipsis'}} >
                        {cid.cid}
                    </Typography>
                </Box>
                <Box>
                <video muted autoplay controls loop src={first.url} style={{maxWidth: '100%', paddingRight: '1em'}}/>
                </Box>
            </Box>
}

export default LocalPollens