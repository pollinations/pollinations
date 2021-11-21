import { useMemo } from "react"
import { Link } from 'react-router-dom'
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

const debug = Debug("home");

export default function Home({ ipfs }) {

    const notebooks = useMemo(() => getNotebooks(ipfs), [ipfs]);
    const { notebookList, options, option } = useFilter(notebooks)

    debug("got notebooks", notebooks);
    return  <>
          {/* title */}
        <Box paddingTop={3}>
          <List>
          <Typography variant="h6" component="h6" gutterBottom>
          🌸 Pollinations
          </Typography>
            Pollinations are an effort to make generative art more approachable.   
                  <ListItem style={{display:"block"}}>- A frontend hosting a set of <a href="https://github.com/pollinations/hive" target="_blank">curated models</a> that allow creating and experimenting with generative art (this page).</ListItem>
                  <ListItem>- The Interplanetary Filesystem (IPFS) for decentralized censorship-resistant storage of models, code and generated content</ListItem>
                  <ListItem>- Pollinations are run on Google Colab (for the free cloud GPUs) </ListItem>
          </List>
          </Box>

          <div children={ // Only show filter after options are loaded
          options.length > 0 &&
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
        subheader={<Link children={name?.slice(2)} to={path}/>} 
        title={<Link children={category?.slice(2)} to={path}/>} 
        action={<Button href={path} endIcon={<OpenInNewIcon />} children='Open'/>} />
            <CardContent>
                <Markdown style={{pointerEvents: "none"}}>{description}</Markdown>
            </CardContent>
        </Card>
    </Box>
}