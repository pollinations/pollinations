import React from "react";
import { useNotebooks } from "../data/notebooks";
import Debug from "debug";
import NotebookSelector from "../components/NotebookSelector";
import { Box, Button, Card, CardActions, CardContent, Link as LinkStyle, Typography, CardHeader, List, ListItem } from "@material-ui/core";
import Markdown from "markdown-to-jsx"
import { Link } from 'react-router-dom'
import useFilter from "../hooks/useFilter"
import OpenInNewIcon from '@material-ui/icons/OpenInNew'

const debug = Debug("home");

export default function Home() {
    const notebooks = useNotebooks();
    const { notebookList, options, option } = useFilter(notebooks)

    debug("got notebooks", notebooks);
    return  <>
          {/* title */}
        <Box m={5}>
          <List>
          <Typography variant="h6" component="h6" gutterBottom>
          🌸 Pollinations
          </Typography>
            Pollinations are an effort to make generative art more approachable.   
            <ListItem>- A frontend hosting a set of curated notebooks that allow creating and experimenting with generative art (this page).</ListItem>
            <ListItem>- The Interplanetary Filesystem (IPFS) for decentralized censorship-resistant storage</ListItem>
            <ListItem>- Pollinations are run on Google Colab (for the free cloud GPUs) </ListItem>
          </List>

          { // Only show filter after options are loaded
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
          }
          
        </Box>
          {
            notebookList
            .map(notebook => <NotebookCard key={notebook.name} notebook={notebook} />)
          }
  </>;
}


const NotebookCard = ({notebook}) => {
    const {category, name, path, Icon, description} = notebook;
    return  <Box m={5}>
                <Card>
                <CardHeader 
                subheader={category} 
                title={<Link to={path} children={name} />} 
                action={<Button href={path} endIcon={<OpenInNewIcon />} children='Open'/>} />
                    <CardContent>
                        <Markdown style={{pointerEvents: "none"}}>{description}</Markdown>
                    </CardContent>
                </Card>
            </Box>
}
 
{/* <Card className={classes.root}>
<CardContent>
  <Typography className={classes.title} color="textSecondary" gutterBottom>
    Word of the Day
  </Typography>
  <Typography variant="h5" component="h2">
    be{bull}nev{bull}o{bull}lent
  </Typography>
  <Typography className={classes.pos} color="textSecondary">
    adjective
  </Typography>
  <Typography variant="body2" component="p">
    well meaning and kindly.
    <br />
    {'"a benevolent smile"'}
  </Typography>
</CardContent>

</Card> */}