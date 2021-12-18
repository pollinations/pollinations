import { useMemo } from "react"

import Markdown, { compiler } from "markdown-to-jsx"
import Debug from "debug"

import { getNotebooks } from "../data/notebooks"
import useFilter from "../hooks/useFilter"

import Box from '@material-ui/core/Box'
import Button from '@material-ui/core/Button'
import Card from '@material-ui/core/Card'
import CardHeader from '@material-ui/core/CardHeader'
import CardContent from '@material-ui/core/CardContent'
import Typography from '@material-ui/core/Typography'
import RouterLink from "../components/molecules/RouterLink"
import Alert from "@material-ui/lab/Alert"
import { CardContainerStyle } from "./styles/card"

const debug = Debug("home");

export default function Home({ ipfs }) {

  const notebooks = useMemo(() => getNotebooks(ipfs), [ipfs]);
  const { notebookList, options, option } = useFilter(notebooks)

  debug("got notebooks", notebooks);
  return  <>
    {
      !options.length && <Alert severity="error">Model list temporarily unavailable. Please retry in a little while</Alert>
    }
    <HeroSection/>

    <Box margin='calc(1.5em + 50px) 0 1.5em 0'>
      { 
        options.length ?
        <>     
          <Typography 
          className='Lato' 
          align='center'
          variant="h3" gutterBottom 
          style={{ marginBottom: '0.8em' }}>

            What do you want to create?

          </Typography>

          <Box display='flex' justifyContent='center' marginBottom='8em'>
            {
              options?.map( opt => 
                <Button key={opt}
                style={{ margin: '0 0.5em' }}
                variant={opt === option.selected ? 'contained' : 'outlined'}
                color={opt === option.selected ? 'secondary' : 'primary'}
                onClick={() => option.setSelected(opt)} >
                  { opt }
                </Button>
              )
            }
          </Box> 
        </>
        :
        <></>
      }
    </Box>
          
    <Box display='grid' gridGap='2em' gridTemplateColumns='repeat(auto-fill, minmax(300px, 1fr))'>
      {
        notebookList
        .map(notebook => 
          <NotebookCard key={notebook.name} notebook={notebook} />
        )
      }
    </Box>
  </>
}










// HERO 
// Component
const HeroSection = props => <Box paddingTop={3}>
  <Typography align='center' variant='h1' gutterBottom>

    pollinations.ai

  </Typography>

  <Box display='grid' gridTemplateColumns='repeat(auto-fill, minmax(300px, 2fr))' 
  gridGap='2em' minHeight='30vh' paddingTop='3em'>

    <Typography variant='h6' style={{ gridColumnStart: 1, gridColumnEnd: 3}}>
      Pollinations is a platform for AI generative media.
      <br/> 
      We want to facilitate the translation of multiple human expressions into AI generated art. 
    </Typography>

    <Typography>
      We gather many generative art models in one space. 
      The models you can find here are all open source and are constantly updated, 
      so you can be sure you will be using the most cutting-edge AI art frameworks.
    </Typography>

  </Box>
</Box>

// Cards 
// Component

const NotebookCard = ({notebook}) => {
    let test = compiler(notebook.description, { wrapper: null })

    const {category, name, path, description} = notebook

    return  <Box>
        <Card style={CardContainerStyle}>

          <CardHeader
          subheader={<CardTitle children={name?.slice(2)} to={path} variant='h4'/>} 
          title={<CardTitle children={category?.slice(2)}to={path} variant='h6'/>} />

          <img src={
            test[0]?.props?.src ? 
            test[0]?.props?.src 
            : test[0]?.props?.children[0]?.props?.src} 
            style={{width: '100%'}}/>

          <CardContent>
              <Markdown options={MarkDownOptions}>
                {description}
              </Markdown>
          </CardContent>

        </Card>
    </Box>
}

const CardTitle = ({to, children, variant }) => <>
  <Typography className='Lato noMargin' variant={variant} gutterBottom>
      <RouterLink to={to}>
        {children}
      </RouterLink>
  </Typography>
</>

// surprise, it's a div instead!
const gambiarraImg = ({ children, ...props }) => (
  <div />
)
const MarkDownOptions = {
  overrides: {
      img: { component: gambiarraImg }
  }
}