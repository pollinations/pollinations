import { routes } from './routes'


import { BrowserRouter as Router, Switch, Route } from 'react-router-dom'


function App() {
    return <Router>


            <Switch
                children={
                    routes.map(route => (
                        <Route 
                            {...route}
                            key={route.path}
                        />
                    ))
                }/>

    </Router>
}

export default App;
