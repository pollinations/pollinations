import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import CardHeader from '@material-ui/core/CardHeader';
import Typography from '@material-ui/core/Typography';
import Alert from '@material-ui/lab/Alert';
import Debug from 'debug';
import { useMemo } from 'react';
import MarkdownContent from '../components/molecules/MarkDownContent';
import RouterLink from '../components/molecules/RouterLink';
import NotebookImage from '../components/organisms/markdownParsers/NotebookImage';
import NotebookInfo from '../components/organisms/markdownParsers/NotebookInfo';
import { getNotebooks } from '../data/notebooks';
import useFilter from '../hooks/useFilter';
import useIPFS from '../hooks/useIPFS';
import { CardContainerStyle } from './styles/card';

const debug = Debug('home');

export default function Home() {
  const ipfs = useIPFS('/ipns/k51qzi5uqu5dh357wyr6q0eb96xdsgtm2q25go6ob13gahxwobevzbx1prl0nk');
  const notebooks = useMemo(() => getNotebooks(ipfs), [ipfs]);
  const { notebookList, options, option } = useFilter(notebooks);

  debug('got notebooks', notebooks);
  return (
    <>
      {
      !options.length && <Alert severity="error">Hey, pollinations.ai is having temporary issues, please retry in few hours.</Alert>
    }
      <HeroSection />

      <Box margin="calc(1.5em + 50px) 0 1.5em 0">
        {
        options.length
          ? (
            <>
              <Typography
                className="Lato"
                align="center"
                variant="h3"
                gutterBottom
                style={{ marginBottom: '0.8em' }}
              >

                What do you want to create?

              </Typography>

              <Box display="flex" justifyContent="center" marginBottom="8em">
                {
                options?.map((opt) => (
                  <Button
                    key={opt}
                    style={{ margin: '0 0.5em' }}
                    variant={opt === option.selected ? 'contained' : 'outlined'}
                    color={opt === option.selected ? 'secondary' : 'primary'}
                    onClick={() => option.setSelected(opt)}
                  >
                    {opt}
                  </Button>
                ))
              }
              </Box>
            </>
          )
          : <></>
      }
      </Box>

      <Box display="grid" gridGap="2em" gridTemplateColumns="repeat(auto-fill, minmax(300px, 1fr))">
        {
        notebookList
          .map((notebook) => <NotebookCard key={notebook.name} notebook={notebook} />)
      }
      </Box>
    </>
  );
}

// HERO
// Component
function HeroSection(props) {
  return (
    <Box paddingTop={3}>
      <Typography align="center" variant="h1" gutterBottom>

        pollinations.ai

      </Typography>

      <Box
        display="grid"
        gridTemplateColumns="repeat(auto-fill, minmax(300px, 2fr))"
        gridGap="2em"
        minHeight="30vh"
        paddingTop="3em"
      >

        <div style={{ gridColumnStart: 1, gridColumnEnd: 3 }}>
          <MarkdownContent id="landingLeft" />
        </div>

        <MarkdownContent id="landingRight" />

      </Box>
    </Box>
  );
}

// Cards
// Component

function NotebookCard({ notebook }) {
  let {
    category, name, path, description,
  } = notebook;

  // remove credits etc (they are separated by a horizontal rule)
  description = description.split('---')[0];

  return (
    <Box>
      <Card style={CardContainerStyle}>

        <CardHeader
          subheader={<CardTitle children={name?.slice(2)} to={path} variant="h4" />}
          title={<CardTitle children={category?.slice(2)} to={path} variant="h6" />}
        />

        <NotebookImage metadata={notebook} style={{ width: '100%' }} />

        <CardContent>
          <NotebookInfo description={description} noImg />
        </CardContent>

      </Card>
    </Box>
  );
}

function CardTitle({ to, children, variant }) {
  return (
    <Typography className="Lato noMargin" variant={variant} gutterBottom>
      <RouterLink to={to}>
        {children}
      </RouterLink>
    </Typography>
  );
}
