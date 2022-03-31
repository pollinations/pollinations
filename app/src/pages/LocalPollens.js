import {
  Box, Button, Card, CardHeader,
} from '@material-ui/core';
import Typography from '@material-ui/core/Typography';
import Debug from 'debug';
import { values } from 'ramda';
import { MediaViewer } from '../components/MediaViewer';
import RouterLink from '../components/molecules/RouterLink';
import { mediaToDisplay } from '../data/media';
import useLocalPollens from '../hooks/useLocalPollens';
import { getNotebookMetadata } from '../utils/notebookMetadata';
import { CardContainerStyle } from './styles/card';

const debug = Debug('localpollens');

function LocalPollens({ node }) {
  const { pollens, popCID } = useLocalPollens(node);

  debug('Localpollens', pollens);
  if (!pollens) return <> </>;

  return (
    <>

      <Typography variant="h2" children="My Pollen" />

      <Box margin="2em 0" display="grid" gridGap="5em" gridTemplateColumns="repeat(auto-fill, minmax(300px, 1fr))">
        {
                values(pollens)
                // .sort( (a,b) => new Date(b.date) - new Date(a.date) )
                  .map((pollen) => <Pollen key={pollen['.cid']} pollen={pollen} popCID={popCID} />)
            }
      </Box>

    </>
  );
}

function Pollen({ pollen, popCID }) {
  // console.log(date, cid, popCID)

  const cid = pollen['.cid'];
  if (!pollen?.output) return null;

  const { first } = mediaToDisplay(pollen.output);
  const metadata = getNotebookMetadata(pollen);

  const primaryInputField = metadata?.primaryInput;
  const primaryInput = pollen?.input?.[primaryInputField];

  return (
    <Box>
      <Card style={CardContainerStyle}>
        <CardHeader subheader={<SubHeader modelName={metadata.name} cid={cid} />} />

        <Box padding="1em">
          <br />
          <Typography>
            {primaryInput}
          </Typography>
        </Box>
        { // catch other formats
                // <video controls loop
                //     src={first.url} style={{
                //         width: '100%', marginTop: '2em'
                //     }} />
            }
        <MediaViewer filename={first.filename} content={first.url} type={first.type} />

        <Box minWidth="100%" display="flex" justifyContent="space-around" padding="1em 0">
          <Button onClick={() => popCID(cid)}>
            [ Remove Pollen ]
          </Button>
          {/* <Button disabled>
                    [ Mint Pollen ]
                </Button> */}
        </Box>
      </Card>
    </Box>
  );
}

export default LocalPollens;

function SubHeader({ modelName, cid }) {
  return (
    <Typography className="Lato noMargin" variant="h4" component="h4" gutterBottom>
      <RouterLink to={`/p/${cid}`}>
        {modelName}
      </RouterLink>
    </Typography>
  );
}
