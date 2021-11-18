import { memo, useMemo } from "react"
import Debug from "debug";

import { SEO } from "../components/Helmet"
import { getMedia } from "../data/media"
import { IpfsLog } from "../components/Logs"
import { NotebookProgress } from "../components/NotebookProgress"
import NotebookTitle from "../components/NotebookTitle"
import { getNotebookMetadata } from "../utils/notebookMetadata"

import Box from '@material-ui/core/Box'
import Typography from "@material-ui/core/Typography"
import Button from "@material-ui/core/Button"

// STREAM VIEWER (/n)

const debug = Debug("ModelViewer");

export default memo(function ResultViewer({ ipfs }) {
  
  const contentID = ipfs[".cid"];
  debug("ModelViewer CID", contentID);
  debug("ModelViewer IPFS", ipfs);
  const metadata = getNotebookMetadata(ipfs);

  const {images, first} = useMemo(() => {
    //if (!ipfs.output) return EMPTY_MEDIA;
    return mediaToDisplay(ipfs.output);
  }, [ipfs.output]);



  return <Box my={2}>
      
        <SEO metadata={metadata} ipfs={ipfs} cid={contentID}/>

        {   // Waiting Screen goes here
            !contentID &&
            <Typography>
                Connecting to Colab...
            </Typography>
        }

        <NotebookTitle metadata={metadata}>
            <Button color="default" href={`/p/${contentID}/create`}>[ Clone ]</Button>
        </NotebookTitle>
        
        <NotebookProgress output={ipfs?.output} metadata={metadata} />
        <div style={styles.big}>

            {   
            // Big Preview
            first.isVideo ?
            <video {...video_props} alt={first.filename} src={first.url}/>
            : <img alt={first.filename} src={first.url}/>
            }

            <div style={styles.query} children={ 
            // Input Query
            ipfs?.input?.text_input && true &&
            <Typography 
                variant="h5" 
                component="h5" 
                gutterBottom
                children={`${ipfs?.input[metadata?.primaryInput]}`}
            /> }/>

        </div>

        <div style={styles.steps}>
            { // Steps Preview
              images.map( ([filename, url]) => <img src={url} alt={filename} style={styles.img} /> )
            }
        </div> 
        
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


function mediaToDisplay(output) {
    const imagesIn = getMedia(output);
    if (!imagesIn || imagesIn.length === 0) return EMPTY_MEDIA;

    // remove first image for large display
    const firstImage = imagesIn.shift()

    const images = every_nth(imagesIn);

    const first = {
        isVideo: firstImage[0].toLowerCase().endsWith(".mp4"),
        filename: firstImage[0],
        url: firstImage[1]
    }

    return { images, first }
}

function every_nth(array){
    const nth = Math.max(1, Math.floor(array.length / 20))
    return array.filter((e, i) => i % nth === nth - 1)
}

const EMPTY_MEDIA = { images: [], first: {} }