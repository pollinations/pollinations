import { useEffect, useMemo, useState } from "react"
import useIPFS from "../hooks/useIPFS"
import { subscribeCID } from "../network/ipfsPubSub"
import ResultViewer from "./ResultViewer"
import Typography from "@material-ui/core/Typography"
import { getNotebookMetadata } from "../utils/notebookMetadata"
import { mediaToDisplay } from "../data/media"
import { Backdrop, Box, Button, Link, Modal, styled } from "@material-ui/core"
import { SEO } from "../components/Helmet"
import NotebookTitle from "../components/NotebookTitle"
import { NotebookProgress } from "../components/NotebookProgress"
import { IpfsLog } from "../components/Logs"
import MediaViewer from "../components/MediaViewer"
import BigPreview from "../components/molecules/BigPreview"

const ChristmasSpecial = () => {
    const [cid, setCid] = useState(null)

    const ipfs = useIPFS(cid)

    useEffect(() => subscribeCID("processing_pollen", "", setCid),[])
    
const contentID = ipfs[".cid"];
  const metadata = getNotebookMetadata(ipfs);
  
  const primaryInputField = metadata?.primaryInput;
  const primaryInput = ipfs?.input?.[primaryInputField];

  const {images, first} = useMemo(() => {
    return mediaToDisplay(ipfs.output);
  }, [ipfs.output]);

return <Modal 
  BackdropComponent={
      styled(Backdrop, {
          name: 'MuiModal', 
          slot: 'Backdrop', 
          overridesResolver: (props, styles) => styles.backdrop, })({ background: 'black',minHeight: '100vh' })}
    open={true}
    //onClose={handleClose} 
    >

    <Box my={2} paddingTop='0em' margin='0' minHeight='100vh'>
      
      <SEO metadata={metadata} ipfs={ipfs} cid={contentID}/>

      <Box marginTop='2em' minWidth='100%' display='flex' 
          justifyContent={!contentID ? 'center' : 'space-around'} alignItems='center' flexWrap='wrap'>

        {   // Waiting Screen goes here
            !contentID ?
            <Box minHeight='70vh' alignItems='center' display='flex'>
            <Typography>
                Connecting to Feed...
            </Typography> 
            </Box>  : <BigPreview {...first}/> 
        }
          
      </Box>
      
    </Box>
    
    </Modal>
}

export default ChristmasSpecial