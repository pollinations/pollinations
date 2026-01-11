import React from 'react';
import { Box, Typography, Button, Grid, Paper } from '@mui/material';
import { Link } from 'react-router-dom';
import { ArrowForward } from '@mui/icons-material';

const HomePage = () => {
  return (
    document.title = "Pollinations GSOC 2026",
    <Box sx={{ padding: '4rem 2rem' }}>
      <Grid container spacing={4} justifyContent="center">
        {/* Main Hero Section */}
        <Grid item xs={12} md={8}>
          <Paper className='glass-card' sx={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <Typography variant='h1' sx={{ fontWeight: 'bold', marginBottom: '1rem' }}>
              Build the Future of AI with Pollinations
            </Typography>
            <Typography variant='h5' sx={{ marginBottom: '2rem', color: 'text.secondary' }}>
              Join our Google Summer of Code program and work on cutting-edge open-source AI projects.
            </Typography>
            <Button
              component={Link}
              to='/projects'
              variant='contained'
              size='large'
              className='neumorphic-button'
              endIcon={<ArrowForward />}
            >
              Explore Projects
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default HomePage;
