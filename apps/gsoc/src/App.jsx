import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Projects from './pages/Projects';
import Mentors from './pages/Mentors';
import About from './pages/About';
import Timeline from './pages/Timeline';
import SocBot from './pages/socBot';
import Contributing from './pages/Contributing';
import CodeOfConduct from './pages/CodeOfConduct';
import NotFound from './pages/NotFound';
import './App.css';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#ffffff',
    },
    background: {
      default: '#09090b',
      paper: 'rgba(255, 255, 255, 0.03)',
    },
    text: {
      primary: '#ffffff',
      secondary: '#a1a1aa',
    },
  },
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: '#09090b',
          margin: 0,
          padding: 0,
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Router>
        <Navbar />
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/projects' element={<Projects />} />
          <Route path='/mentors' element={<Mentors />} />
          <Route path='/timeline' element={<Timeline />} />
          <Route path='/bot' element={<SocBot />} />
          <Route path='/about' element={<About />} />
          <Route path='/contributing' element={<Contributing />} />
          <Route path='/coc' element={<CodeOfConduct />} />
          <Route path='*' element={<NotFound />} />
        </Routes>
        <Footer />
      </Router>
    </ThemeProvider>
  );
}

export default App;
