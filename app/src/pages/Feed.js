import { Box } from "@material-ui/core"
import Typography from "@material-ui/core/Typography"
import { useEffect, useMemo } from "react"
import { SEO } from "../components/Helmet"
import BigPreview from "../components/molecules/BigPreview"
import { mediaToDisplay } from "../data/media"
import useIPFS from "../hooks/useIPFS"
import useSubscribe from "../hooks/useSubscribe"
import { subscribeCID } from "../network/ipfsPubSub"
import { getNotebookMetadata } from "../utils/notebookMetadata"

const Feed = () => {

    const cid = useSubscribe("processing_pollen")
    
    const ipfs = useIPFS(cid)

    useEffect(() => subscribeCID("processing_pollen", "", setCid),[])
   
    const {images, first} = useMemo(() => {
      return mediaToDisplay(ipfs?.output)
    }, [ipfs?.output])
  
    if (!ipfs)
      return null
      
    const contentID = ipfs[".cid"]
    const metadata = getNotebookMetadata(ipfs)
    
    const primaryInputField = metadata?.primaryInput
    const primaryInput = ipfs?.input?.[primaryInputField]


    return <>
    <Box my={2} marginBottom='5em'>
      
      <SEO metadata={metadata} ipfs={ipfs} cid={contentID}/>

      <Box marginTop='2em' minWidth='100%' display='flex' 
          justifyContent={!contentID ? 'center' : 'space-around'} alignItems='center' flexWrap='wrap'>

          {   // Waiting Screen goes here
              !contentID ?
              <Box minHeight='70vh' alignItems='center' display='flex'>
                <Typography>
                    Connecting to Feed...
                </Typography> 
              </Box>  : <>

                <BigPreview {...first}/>

                <Box minWidth='200px' maxWidth='20%'>
                    <Typography variant="h5" gutterBottom> 
                        {primaryInput}
                    </Typography>
                </Box>

              </>
          }

          
      </Box>
      
    </Box>
    
    </>
}

export default Feed