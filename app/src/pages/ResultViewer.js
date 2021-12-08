import { memo, useMemo } from "react"
import Debug from "debug";

import { SEO } from "../components/Helmet"
import { mediaToDisplay } from "../data/media"
import { IpfsLog } from "../components/Logs"
import { NotebookProgress } from "../components/NotebookProgress"
import NotebookTitle from "../components/NotebookTitle"
import { getNotebookMetadata } from "../utils/notebookMetadata"

import Box from '@material-ui/core/Box'
import Typography from "@material-ui/core/Typography"
import Button from "@material-ui/core/Button"
import { Link } from "react-router-dom";
import MediaViewer from "../components/MediaViewer";

// STREAM VIEWER (/n)

const debug = Debug("ModelViewer");

export default memo(function ResultViewer({ ipfs }) {
  
  const contentID = ipfs[".cid"];
  debug("ModelViewer CID", contentID);
  debug("ModelViewer IPFS", ipfs);
  const metadata = getNotebookMetadata(ipfs);
  
  const primaryInputField = metadata?.primaryInput;
  const primaryInput = ipfs?.input?.[primaryInputField];

  const {images, first} = useMemo(() => {
    return mediaToDisplay(ipfs.output);
  }, [ipfs.output]);



  return <Box my={2}>
      
        <SEO metadata={metadata} ipfs={ipfs} cid={contentID}/>
    
        {   // Waiting Screen goes here
            !contentID &&
            <Typography>
                Connecting to GPU...
            </Typography>
        }

        <NotebookTitle metadata={metadata}>
            <Button color="default" to={`/p/${contentID}/create`} component={Link}>
                [ Clone ]
            </Button>
        </NotebookTitle>
        
        <NotebookProgress output={ipfs?.output} metadata={metadata} />

        <Box marginTop='2em' minWidth='100%' display='flex' 
            justifyContent='space-around' alignItems='flex-end' flexWrap='wrap'>

            <BigPreview {...first}/>

            <Box minWidth='200px' maxWidth='20%'>
                <Typography variant="h5" gutterBottom> 
                    {primaryInput}
                </Typography>
            </Box>
        </Box>

        {/* previews */}
        {ipfs.output && <div >
          <MediaViewer output={ipfs.output} contentID={contentID} />
        </div>
        }

        <div style={{ width: '100%' }}>
          <IpfsLog ipfs={ipfs} contentID={contentID} />
        </div>  
        
      </Box>
})

const BigPreview = ({ isVideo, filename, url }) => isVideo ?
    <video muted autoPlay controls loop alt={filename} src={url}
    style={{ width: 'calc(100vh - 90px)' }}/>
    : 
    <img alt={filename} src={url} />


