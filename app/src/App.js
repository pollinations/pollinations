import { routes } from './routes'

import { Button, Container, Typography, Link } from "@material-ui/core"

import { BrowserRouter as Router, Switch, Route } from 'react-router-dom'
import GitHubIcon from '@material-ui/icons/GitHub';

function App() {
    return <Router>
        <Container maxWidth="md">

            <Switch
                children={
                    routes.map(route => (
                        <Route 
                            {...route}
                            key={route.path}
                        />
                    ))
                }/>

            <Typography align="right" > Get help and contribute on<Button href="https://github.com/pollinations/pollinations"> Github&nbsp;<GitHubIcon /></Button></Typography>
        </Container>
    </Router>
}

export default App;
