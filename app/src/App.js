import { routes } from './routes'

import { Container } from "@material-ui/core"

import { BrowserRouter as Router, Switch, Route } from 'react-router-dom'

function App() {
    return <Router>
        <Container>

            <Switch
                children={
                    routes.map(route => (
                        <Route
                            path={route.path}
                            exact={route.exact}
                            key={route.path}
                            children={route.children} />
                    ))
                }/>

        </Container>
    </Router>
}

export default App;
