import { useMemo } from "react"

import Markdown from "markdown-to-jsx"
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

const debug = Debug("home");

export default function Home({ ipfs }) {

  const notebooks = useMemo(() => getNotebooks(ipfs), [ipfs]);
  const { notebookList, options, option } = useFilter(notebooks)

  debug("got notebooks", notebooks);
  return  <>
  
    <HeroSection/>

    <FilterToolBarStyle>
      { 
        options.length &&
        <>     
          <Typography {...FilterTitleProps}>
            What do you want to create?
          </Typography>

          <div style={{display: 'flex', justifyContent:'center', marginBottom: '8em'}}>
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
          </div> 
        </>
      }
    </FilterToolBarStyle>
          
    <NotebookContainerStyle>
      {
        notebookList
        .map(notebook => <NotebookCard key={notebook.name} notebook={notebook} />)
      }
    </NotebookContainerStyle>
  </>
}










// ! HERO decide/move this
// Component
const HeroSection = props => <Box paddingTop={3}>
  <Typography {...HeroTitleProps}>
    pollinations.ai
  </Typography>
  <HeroContentStyle>
    {
      HeroContent.map( props => 
        <Typography {...props} gutterBottom/> 
      )
    }
  </HeroContentStyle>
</Box>

// Style and Props
let HeroTitleProps = {
  align:'center',
  variant:"h1",
  gutterBottom: true
}
const HeroContentStyle = props => <div style={{
  display: 'grid', 
  gridAutoFlow: 'column', 
  gridTemplateColumns: 'minmax(300px, 2fr) minmax(300px, 1fr)',
  gridTemplateRows: 'auto',
  width: '100%',
  minHeight: '30vh', 
  paddingTop: '3em'
}} {...props} />

// Content
let HeroContent = [
  { 
    style: { paddingRight: '1em' },
    variant: 'h6',
    children: <> 
      Pollinations is a platform for AI generative media.
      <br/> 
      We want to facilitate the translation of multiple human expressions into AI generated art. 
    </>
  },
  {
    variant: 'p',
    children: <> 
      We gather many generative art models in one space. 
      The models you can find here are all open source and are constantly updated, 
      so you can be sure you will be using the most cutting-edge AI art frameworks.
    </>
  }
]






//  ! FilterUI decide/move this

// Styles and Props
let NotebookContainerStyle = props => <div style={{
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: '1em'
}} {...props}/>

let FilterToolBarStyle = props => <div style={{
  margin: '1.5em 0',
  marginTop: '50px'
}} {...props}/>

let FilterTitleProps = {
  className:'Lato',
  variant:"h3",
  gutterBottom: true,
  style: { marginBottom: '0.8em' },
  align: 'center'
}





//  !  CARDS decide/move this

const NotebookCard = ({notebook}) => {
    const {category, name, path, Icon, description} = notebook;
    return  <Box>
        <Card style={{
          backgroundColor: 'transparent', 
          border: '0.9px solid rgb(255, 236, 249)', borderRadius: 20}}>
        <CardHeader
        subheader={<Typography className='Lato noMargin' variant="h4" component="h4" gutterBottom children={<RouterLink children={name?.slice(2)} to={path}/>}/>} 
        title={<Typography className='Lato' variant="h6" component="h6" gutterBottom children={<RouterLink to={path} children={category?.slice(2)}/>} />} 
        action={<></>} />
            <CardContent>

                <Markdown style={{pointerEvents: "none"}}>
                  {description}
                </Markdown>

            </CardContent>
        </Card>
    </Box>
}