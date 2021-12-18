import Box from '@material-ui/core/Box';
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import Debug from "debug";
import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { SEO } from "../components/Helmet";
import { IpfsLog } from "../components/Logs";
import MediaViewer from "../components/MediaViewer";
import BigPreview from "../components/molecules/BigPreview";
import MarkDownContent from '../components/molecules/MarkDownContent';
import { NotebookProgress } from "../components/NotebookProgress";
import NotebookTitle from "../components/NotebookTitle";
import { mediaToDisplay } from "../data/media";
import { getNotebookMetadata } from "../utils/notebookMetadata";



// STREAM VIEWER (/n)

const debug = Debug("ModelViewer");

export default memo(function ResultViewer({ ipfs }) {

  const contentID = ipfs[".cid"]
  debug("ModelViewer CID", contentID)
  debug("ModelViewer IPFS", ipfs)
  const metadata = getNotebookMetadata(ipfs)

  const primaryInputField = metadata?.primaryInput
  const primaryInput = ipfs?.input?.[primaryInputField]

  const success = ipfs?.output?.success !== false

  const { images, first } = useMemo(() => {
    return mediaToDisplay(ipfs.output)
  }, [ipfs.output])



  return <Box my={2}>

    <SEO metadata={metadata} ipfs={ipfs} cid={contentID} />

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
    {success ? <Preview {...{ first, primaryInput, ipfs }} /> : <MarkDownContent id={"failure"} contentID={contentID} />}

    <div style={{ width: '100%' }}>
      <IpfsLog ipfs={ipfs} contentID={contentID} />
    </div>

  </Box>
})

function Preview({ first, primaryInput, ipfs }) {
  return <>
    <Box marginTop='2em' minWidth='100%' display='flex'
      justifyContent='space-around' alignItems='flex-end' flexWrap='wrap'>

      <BigPreview {...first} />

      <Box minWidth='200px' maxWidth='20%'>
        <Typography variant="h5" gutterBottom>
          {primaryInput}
        </Typography>
      </Box>
    </Box>

    {/* previews */}
    {ipfs.output && <div>
      <MediaViewer output={ipfs.output} contentID={ipfs[".cid"]} />
    </div>}
  </>
}
