import { memo, useEffect, useState } from "react"

import Box from '@material-ui/core/Box'
import Typography from "@material-ui/core/Typography"

// Components
import { SEO } from "../components/Helmet"
import useIPFS from "../hooks/useIPFS"
import { getMedia } from "../data/media"
import readMetadata from "../utils/notebookMetadata"
import Debug from "debug";
import { IpfsLog } from "../components/Logs"
import { NotebookProgress } from "../components/NotebookProgress"
import NotebookTitle from "../components/NotebookTitle"
import { Button } from "@material-ui/core"

const debug = Debug("ModelViewer");

export default memo(function ModelViewer({contentID}) {
  
  debug("ModelViewer CID", contentID)
  const ipfs = useIPFS(contentID);
  debug("ModelViewer IPFS", ipfs)
  const metadata = getNotebookMetadata(ipfs)

  const [ images, setImages ] = useState([])
  const [ first, setFirst ] = useState({ isVideo: false, filename: '', url: ''})

  
  useEffect(() => {
    const images = getMedia(ipfs?.output)
    if (!images || images.length === 0) return 
    
    // remove first image for large display
    const firstImage = images.shift();

    setImages( every_nth(images) )
    setFirst({
        isVideo: firstImage[0].toLowerCase().endsWith(".mp4"),
        filename: firstImage[0],
        url: firstImage[1]
    })
  },[ipfs.output])
  
  return <Box my={2}>
      
        <SEO metadata={metadata} ipfs={ipfs} cid={contentID}/>
        <NotebookTitle metadata={metadata}>
            <Button  color="default" href={`/c/${contentID}`}>[ Clone ]</Button>
        </NotebookTitle>
        
        <NotebookProgress
            output={ipfs?.output}
            metadata={metadata}
          />
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
                children={`${ipfs?.input?.text_input}`}
            /> }/>

        </div>

        <div style={styles.steps} children={   
            // Steps Preview
            images.map( ([filename, url]) => <img src={url} alt={filename} style={styles.img} /> )
        }/>

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


// for backward compatibility we check if the notebook.ipynb is at / or at /input
// the new "correct" way is to save the notebook.ipynb to /input

const getNotebookMetadata = ipfs => readMetadata((ipfs?.input && ipfs.input["notebook.ipynb"]) || ipfs && ipfs["notebook.ipynb"]);

function every_nth(array){
    const nth = Math.max(1, Math.floor(array.length / 20))
    return array.filter((e, i) => i % nth === nth - 1)
}