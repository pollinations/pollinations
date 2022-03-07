import { createMuiTheme, ThemeProvider } from '@material-ui/core'
import CssBaseline from '@material-ui/core/CssBaseline'
import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'
import './index.css'
import * as serviceWorkerRegistration from './serviceWorkerRegistration'


const darkTheme = createMuiTheme({
  typography: {
    fontFamily: 'Source Code Pro'
  },
  palette: {
    type: 'dark',
    primary: {
      main: 'rgb(255, 236, 249)',
      },
    secondary: {
      main: 'rgb(166, 213, 250)'
    }
  },
})

ReactDOM.render(
    <ThemeProvider theme={darkTheme}>
     <CssBaseline />
     <App />
    </ThemeProvider>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.unregister();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
// reportWebVitals(console.log);
