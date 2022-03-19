import {Box} from "@material-ui/core"
import Typography from "@material-ui/core/Typography"
import {useMemo, useState} from "react"
import {SEO} from "../components/Helmet"
import BigPreview from "../components/molecules/BigPreview"
import {mediaToDisplay} from "../data/media"
import useIPFS from "../hooks/useIPFS"
import useSubscribe from "../hooks/useSubscribe"
import {getNotebookMetadata} from "../utils/notebookMetadata"
import {useThrottle} from "react-use"

const Feed = () => {

    const cid = useSubscribe("processing_pollen")

    const ipfs = useIPFS(cid)

    const {images, first: result} = useMemo(() => {
        return mediaToDisplay(ipfs?.output)
    }, [ipfs?.output])

    const throttledResult = useThrottle(result, 3000);


    if (!ipfs)
        return null

    const contentID = ipfs[".cid"]
    const metadata = getNotebookMetadata(ipfs)

    const primaryInputField = metadata?.primaryInput
    const primaryInput = ipfs?.input?.[primaryInputField]

    const throttledPrimaryInput = useThrottle(primaryInput, 3000);


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
                        </Box> : <>

                            <BigPreview {...throttledResult}/>

                            <Box minWidth='200px' maxWidth='20%'>
                                <Typography variant="h5" gutterBottom>
                                    {throttledPrimaryInput}
                                </Typography>
                            </Box>

                        </>
                }


            </Box>

        </Box>

    </>
}

export default Feed