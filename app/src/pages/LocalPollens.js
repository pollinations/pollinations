import { Box, Card, CardHeader } from "@material-ui/core"
import Typography from "@material-ui/core/Typography"
import RouterLink from "../components/molecules/RouterLink"
import { mediaToDisplay } from "../data/media"
import useIPFS from "../hooks/useIPFS"
import useLocalPollens from "../hooks/useLocalPollens"
import { getNotebookMetadata } from "../utils/notebookMetadata"
import { CardContainerStyle } from "./styles/card"

const LocalPollens = ({ node }) => {

    const { pollens, pushCID } = useLocalPollens(node)

    return <>

        <Typography variant='h2' children='My Pollen' />


        <Box margin='2em 0' display='grid' gridGap='5em' gridTemplateColumns='repeat(auto-fill, minmax(300px, 1fr))'>
            {

                pollens?.reverse().map(pollen => <EachPollen key={pollen.cid} {...pollen} />)
            }
        </Box>

    </>
}

const EachPollen = cid => {

    const ipfs = useIPFS(cid, true)

    const { first } = mediaToDisplay(ipfs.output)
    const metadata = getNotebookMetadata(ipfs);

    const primaryInputField = metadata?.primaryInput;
    const primaryInput = ipfs?.input?.[primaryInputField];

    return <Box>
        <Card style={CardContainerStyle}>
            <CardHeader subheader={<SubHeader cid={cid?.cid} />} />

            <Box padding='1em'>
                <br />
                <Typography>
                    {primaryInput}
                </Typography>
            </Box>
            { // catch other formats
                <video muted autoplay controls loop
                    src={first.url} style={{
                        width: '100%', marginTop: '2em'
                    }} />
            }
        </Card>
    </Box>
}

export default LocalPollens

const SubHeader = ({ cid }) => <>
    <Typography className='Lato noMargin' variant="h4" component="h4" gutterBottom>
        <RouterLink to={`/p/${cid}`}>
            {`${cid.slice(0, 13)}...`}
        </RouterLink>
    </Typography>
</>