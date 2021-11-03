import React from "react";
import { useNotebooks } from "../data/notebooks";
import Debug from "debug";
import NotebookSelector from "../components/NotebookSelector";
import { Box, Button, Card, CardActions, CardContent, Container, Typography, Link, CardHeader, List, ListItem } from "@material-ui/core";
import Markdown from "markdown-to-jsx";


const debug = Debug("home");

export default function Home() {
    const notebooks = useNotebooks();
    debug("got notebooks", notebooks);
    return  <>
                <Container maxWidth="md">
                    {/* title */}
                    <Box m={5}>
                    <List>
                    <Typography variant="h6" component="h6" gutterBottom>
                    🌸 Pollinations
                    </Typography>
                     Pollinations are an effort to make generative art more approachable.   
                  <ListItem style={{display:"block"}}>- A frontend hosting a set of <a href="https://github.com/pollinations/hive" target="_blank">curated models</a> that allow creating and experimenting with generative art (this page).</ListItem>
                  <ListItem>- The Interplanetary Filesystem (IPFS) for decentralized censorship-resistant storage of generated content</ListItem>
                  <ListItem>- Pollinations are run on Google Colab (for the free cloud GPUs) </ListItem>
                  <ListItem></ListItem>
                </List>         
                    <Typography variant="h6" component="h6" gutterBottom>
                        Select a model
                    </Typography>
                    </Box>
                    {notebooks.map(notebook => <NotebookCard key={notebook.name} notebook={notebook} />)}
                </Container>
            </>;
}


const NotebookCard = ({notebook}) => {
    const {category, name, path, Icon, description} = notebook;
    return  <Box m={5}>
                <Card>
                <CardHeader subheader={category} title={<Link href={path}>{name}</Link>} action={<Button href={path}><Icon /></Button>} />
                    <CardContent>
                        <Markdown style={{pointerEvents: "none"}}>{description}</Markdown>
                    </CardContent>
                </Card>
            </Box>;
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