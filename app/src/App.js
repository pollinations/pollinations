import { routes } from './routes'

import { Container } from "@material-ui/core"

import { BrowserRouter as Router, Switch, Route } from 'react-router-dom'

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

        </Container>
    </Router>
}

export default App;
