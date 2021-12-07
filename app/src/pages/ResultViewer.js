import { memo, useMemo } from "react"
import Debug from "debug";

import { SEO } from "../components/Helmet"
import { getMedia, mediaToDisplay } from "../data/media"
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
            <Button color="default" to={`/p/${contentID}/create`} component={Link}>[ Clone ]</Button>
        </NotebookTitle>
        
        <NotebookProgress output={ipfs?.output} metadata={metadata} />
        <div style={styles.big}>

            {   
            // Big Preview
            first.isVideo ?
            <video {...video_props} alt={first.filename} src={first.url}/>
            : <img alt={first.filename} src={first.url}/>
            }

            <div style={styles.query}>
            <Typography variant="h5" component="h5" gutterBottom> 
                {primaryInput}
            </Typography>

            </div>
        </div>

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

const video_props = {
    muted: true,
    autoPlay: true,
    controls: true,
    loop: true,
    style: { width: 'calc(100vh - 90px)' }
}

// temporary
const styles = {
    big: {
        width: '100%', 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        marginBottom: '1em'
    },
    steps: {
        width: '100%',
        display: 'grid',
        gap: '1em',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        margin: '1em 0'
    },
    query: {
        maxWidth: '20%',
        minWidth: 200,
    },
    img: {
        width: '100%'
    },
    fab: {
        position: 'fixed',
        bottom: '1em',
        right: '1em'
    }
}

