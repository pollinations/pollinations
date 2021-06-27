import { routes } from './routes'

import { Button, Container } from "@material-ui/core"

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

            Get Documentation, Support and Contribute on<Button href="https://github.com/voodoohop/pollinations"> Github&nbsp;<GitHubIcon /></Button>
        </Container>
    </Router>
}

export default App;
