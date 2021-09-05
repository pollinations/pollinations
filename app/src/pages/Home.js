import React from "react";
import { useNotebooks } from "../data/notebooks";
import Debug from "debug";
import NotebookSelector from "../components/NotebookSelector";
import { Box, Button, Card, CardActions, CardContent, Container, Typography, Link, CardHeader } from "@material-ui/core";


const debug = Debug("home");

export default function Home() {
    const notebooks = useNotebooks();
    debug("got notebooks", notebooks);
    return  <>
                <NotebookSelector />
                    <Container maxWidth="md">
                        {/* title */}
                        <Box m={5}>
                        <Typography variant="h4" component="h1" gutterBottom>
                            Select a model
                        </Typography>
                        </Box>
                        {notebooks.map(notebook => <NotebookCard key={notebook.name} notebook={notebook} />)}
                    </Container>
            </>;
}


const NotebookCard = ({notebook}) => {
    const {category, name, path, Icon} = notebook;
    return  <Box m={5}>
                <Card>
                <CardHeader subheader={category} action={<Icon />} />
                    <CardContent>
                        <Typography variant="h6" component="h6">
                            <Link href={path}> {name} </Link>    
                        </Typography>
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
<CardActions>
  <Button size="small">Learn More</Button>
</CardActions>
</Card> */}