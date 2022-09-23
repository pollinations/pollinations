import { createMuiTheme, ThemeProvider } from '@material-ui/core'
import CssBaseline from '@material-ui/core/CssBaseline'
import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'
import { AuthProvider } from './hooks/useAuth'

import './index.css'

const darkTheme = createMuiTheme({
  typography: {
    fontFamily: 'Open Sans'
  },
  palette: {
    type: 'dark',
    primary: {
      main: 'rgb(255, 255, 255)',
      },
    secondary: {
      main: 'rgb(166, 213, 250)'
    }
  },
})

ReactDOM.render(
    <ThemeProvider theme={darkTheme}>
      <AuthProvider>
          <CssBaseline />
          <App />
      </AuthProvider>
    </ThemeProvider>,
  document.getElementById('root')
);

