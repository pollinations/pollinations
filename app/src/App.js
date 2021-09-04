import React, {useEffect, useState} from 'react'
import { getRoutes } from './routes'


import { BrowserRouter as Router, Switch, Route } from 'react-router-dom'


function App() {
    const [fetchedRoutes, setFetchedRoutes] = useState([]);
    useEffect(async () => {
        setFetchedRoutes(await getRoutes());
    }, [])
    return <Router>
            <Switch
                children={
                    fetchedRoutes.map(route => (
                        <Route 
                            {...route}
                            key={route.path}
                        />
                    ))
                }/>

    </Router>
}

export default App;
