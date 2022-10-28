import Box from '@material-ui/core/Box';
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import Debug from "debug";
import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { FailureViewer } from '../components/FailureViewer';
// import { IpfsLog } from "../components/Logs";
import styled from '@emotion/styled';
import Banner from '../components/Banner';
import { IpfsLog } from '../components/Logs';
import MediaViewer from "../components/MediaViewer";
import BigPreview from "../components/molecules/BigPreview";
import { NotebookProgress } from "../components/NotebookProgress";
import NotebookTitle from "../components/NotebookTitle";
import { getMedia, mediaToDisplay } from "../data/media";
import useNotebookMetadata from '../hooks/useNotebookMetadata';
import { BaseContainer } from '../styles/global';

// STREAM VIEWER (/n)

const debug = Debug("ResultViewer");

export default memo(function ResultViewer({ ipfs }) {



  const { first } = useMemo(() => {
    return mediaToDisplay(ipfs?.output)
  }, [ipfs?.output])

  const metadata = useNotebookMetadata(ipfs)

  if (!ipfs?.output)
    return <LoadingStyle>
      <h2 style={{textAlign: 'center'}}>Warming up... Results should start appearing soon.</h2>
    </LoadingStyle>
  

  const contentID = ipfs[".cid"]

  const primaryInputField = metadata?.primaryInput
  const primaryInputRaw = ipfs?.input?.[primaryInputField]
  const primaryInput = typeof primaryInputRaw === "string" ? primaryInputRaw : JSON.stringify(primaryInputRaw) 

  const success = ipfs?.output?.success !== false
  debug("success", success, ipfs?.output)
  debug("ModelViewer CID", contentID)
  debug("ModelViewer IPFS", ipfs)

  const customEndpoint = ipfs?.input?.customEndpoint
  const createURL = customEndpoint ? customEndpoint : `/p/${contentID}/create`
  const modelName = metadata?.name || customEndpoint 

  return <BaseContainer >

      {/* <SEO metadata={metadata} ipfs={ipfs} cid={contentID} /> */}
    <Banner/>
    <Space/>
    {   // Waiting Screen goes here
      !contentID &&
      <Typography>
        Connecting to GPU...
      </Typography>
    }

    <NotebookTitle name={modelName}>
      <Button color="default" to={createURL} component={Link}>
        [ Clone ]
      </Button>
    </NotebookTitle>


    <NotebookProgress output={ipfs?.output} metadata={metadata} />

    {success ? <Preview {...{ first, primaryInput, ipfs }} /> : <FailureViewer contentID={contentID} ipfs={ipfs} />}

    { <div style={{ width: '100%' }}>
      <IpfsLog ipfs={ipfs} contentID={contentID} />
    </div> }

  </BaseContainer>
})
const Space = styled.div`
width: 100%;
height: 2em;
`

const LoadingStyle = styled(BaseContainer)`
min-height: 80vh;
display: flex;
align-items: center;
justify-content: center;
`

function Preview({ first, primaryInput, ipfs }) {

  return <>
    <Box marginTop='2em' minWidth='100%' display='flex' minHeight='50vh'
      justifyContent='space-around' alignItems='flex-start' flexWrap='wrap'>

      {
        getMedia(ipfs.output)?.length ? <>
        <BigPreview {...first} />
        <Box minWidth='200px' maxWidth='20%'>
          <Typography variant="h5" gutterBottom>
            {primaryInput}
          </Typography>
        </Box> </>
        :
        <Typography variant="body2" color="textSecondary" align="flex-start" style={{marginRight: 'auto !important'}} >
          Results should start appearing within a minute or two.
        </Typography> 
      }

    </Box>

    {/* previews */}
    {ipfs.output && <div>
      <MediaViewer output={ipfs.output} contentID={ipfs[".cid"]} />
    </div>}
  </>
}
