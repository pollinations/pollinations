import React, {useEffect, useState} from 'react'
import { getRoutes } from './routes'


import { BrowserRouter as Router, Switch, Route } from 'react-router-dom'
import { AppContainer } from './pages/AppContainer';


function App() {
    const routes = getRoutes();
    return <Router>
        <AppContainer/>
    </Router>
}

export default App;
