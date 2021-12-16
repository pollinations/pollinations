import { useEffect, useMemo, useState } from "react"
import useIPFS from "../hooks/useIPFS"
import Typography from "@material-ui/core/Typography"
import { getNotebookMetadata } from "../utils/notebookMetadata"
import { mediaToDisplay } from "../data/media"
import { Box, Button, Link, List, ListItem } from "@material-ui/core"
import useLocalStorage from "../hooks/useLocalStorage"
import useLocalPollens from "../hooks/useLocalPollens"
import RouterLink from "../components/molecules/RouterLink"

const LocalPollens = ({node}) => {
    
    const { pollens, pushCID } = useLocalPollens(node)  

    return <>
    
    <Typography variant='h2' children='Local Pollens'/>

    <Box margin='2em 0'>

        <Box display='grid' gridGap='5em' gridTemplateColumns='repeat(auto-fill, minmax(300px, 1fr))'>
            {   
                
                pollens?.map( pollen => <EachPollen key={pollen.cid} cid={pollen.cid}/>)
            }
        </Box>
        
    </Box>
    </>
}

const EachPollen = cid => {

    const ipfs = useIPFS(cid, true)

    const { first } = mediaToDisplay(ipfs.output)
    const metadata = getNotebookMetadata(ipfs);
    
    const primaryInputField = metadata?.primaryInput;
    const primaryInput = ipfs?.input?.[primaryInputField];

    return <Box 
            key={cid} 
            display='grid' 
            gridGap='2em' 
            gridTemplateColumns='repeat(auto-fill, minmax(200px, 1fr))'>

                <Box gridColumnStart={1} gridColumnEnd={3} >
                    <Typography>
                        {primaryInput}
                    </Typography>

                    <Typography style={{textOverflow: 'elipsis'}} >
                        Contend ID: <RouterLink to={`/p/${cid.cid}`} children={`${cid.cid.slice(0,3)}...${cid.cid.slice(cid.cid.length-6, -3)}`}/>
                    </Typography>
                {

                <video muted autoplay controls loop 
                    src={first.url} style={{
                    width: '100%', marginTop: '2em'}}/>
                
                }
                </Box>

            </Box>
}

export default LocalPollens