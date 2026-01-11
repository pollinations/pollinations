import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { AppBar, Toolbar, Button, createTheme, ThemeProvider, Box } from '@mui/material';
import Home from './pages/Home';
import Projects from './pages/Projects';
import Mentors from './pages/Mentors';
import About from './pages/About';
import Timeline from './pages/Timeline';
import './App.css'; // Import the new stylesheet

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#9e78f7',
    },
    background: {
      default: '#1e0c42',
      paper: 'rgba(255, 255, 255, 0.1)',
    },
    text: {
      primary: '#ffffff',
      secondary: '#cbbde2',
    },
  },
  typography: {
    fontFamily: 'Inter, sans-serif',
  },
});

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <Router>
        <AppBar position='static' color='transparent' elevation={0} sx={{ backdropFilter: 'blur(10px)', backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <Toolbar>
            <Link to='/' style={{ textDecoration: 'none', color: 'inherit', flexGrow: 1, fontSize: '1.5rem' }}>
              Pollinations.ai
            </Link>
            <nav>
              <Button component={Link} to='/' sx={{ color: '#cbbde2' }}>Home</Button>
              <Button component={Link} to='/projects' sx={{ color: '#cbbde2' }}>Projects</Button>
              <Button component={Link} to='/mentors' sx={{ color: '#cbbde2' }}>Mentors</Button>
              <Button component={Link} to='/timeline' sx={{ color: '#cbbde2' }}>Timeline</Button>
              <Button component={Link} to='/about' sx={{ color: '#cbbde2' }}>About</Button>
            </nav>
          </Toolbar>
        </AppBar>
        <Box sx={{ marginTop: '2rem' }}>
          <Routes>
            <Route path='/' element={<Home />} />
            <Route path='/projects' element={<Projects />} />
            <Route path='/mentors' element={<Mentors />} />
            <Route path='/timeline' element={<Timeline />} />
            <Route path='/about' element={<About />} />
          </Routes>
        </Box>
      </Router>
    </ThemeProvider>
  );
}

export default App;
