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
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import OpenInNewIcon from '@material-ui/icons/OpenInNew'
import RouterLink from "../components/molecules/RouterLink"

const debug = Debug("home");

export default function Home({ ipfs }) {

    const notebooks = useMemo(() => getNotebooks(ipfs), [ipfs]);
    const { notebookList, options, option } = useFilter(notebooks)

    debug("got notebooks", notebooks);
    return  <>
          {/* title */}
        <Box paddingTop={3}>
          <Typography align='center' variant="h1" component="h1" gutterBottom>
          pollinations.ai
          </Typography>

          <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', width: '100%',minHeight: '30vh', paddingTop: '3em'}}>
            <Typography align='center' variant="h6" component="h6" gutterBottom style={{paddingRight: '1em'}}>
            We want to facilitate the translation of multiple human expressions into multiple forms of media.  
            </Typography>
            <Typography variant="p" component="p" gutterBottom>
            Pollinations is a platform for generative media. We gather many generative art frameworks in one space, with a easy to use interface. We want to make AI generated media available to everyone.  The models you can find here are constantly being updated, so you know you will be using the most cutting-edge AI art frameworks.
            </Typography>
          </div>


          </Box>

          <div children={ options.length > 0 &&
          <>     
            <Typography 
              variant="h6" 
              component="h6" 
              gutterBottom
              children='What do you want to create?'/>
            <div style={{display: 'flex', justifyContent:'space-around'}} children={
              options?.map( opt => 
                <Button 
                  color={opt === option.selected ? 'secondary' : ''}
                  onClick={() => option.setSelected(opt)} 
                  children={opt} 
                  key={opt}/>)
            }/>
          </>
          } style={GridStyleFilter}/>
          
          {console.log(notebooks)}

          <div children={
            notebookList
            .map(notebook => <NotebookCard key={notebook.name} notebook={notebook} />)
          } style={GridStyleNotebooks}/>
  </>;
}
let GridStyleNotebooks = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: '1em'
}
let GridStyleFilter = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: '1em',
  margin: '1.5em 0',
  marginTop: '50px'
}


const NotebookCard = ({notebook}) => {
    const {category, name, path, Icon, description} = notebook;
    return  <Box>
        <Card>
        <CardHeader 
        subheader={<RouterLink children={name?.slice(2)} to={path}/>} 
        title={<RouterLink children={category?.slice(2)} to={path}/>} 
        action={<Button href={path} endIcon={<OpenInNewIcon />} children='Open'/>} />
            <CardContent>
                <Markdown style={{pointerEvents: "none"}}>{description}</Markdown>
            </CardContent>
        </Card>
    </Box>
}