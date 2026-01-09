import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

const AboutPage = () => {
  return (
    <Box sx={{ padding: '4rem 2rem', textAlign: 'center' }}>
      <Paper className='glass-card' sx={{ padding: '4rem 2rem' }}>
        <Typography variant='h2' gutterBottom>
          About Pollinations.ai
        </Typography>
        <Typography variant='h5' sx={{ color: 'text.secondary', marginBottom: '2rem' }}>
          Pollinations.ai is a platform for creating and sharing AI-generated media.
        </Typography>
        <Typography variant='body1' sx={{ marginBottom: '1rem' }}>
          We are a community of artists, developers, and researchers passionate about the creative potential of artificial intelligence.
        </Typography>
        <Typography variant='body1'>
          Contact us at: contact@pollinations.ai
        </Typography>
      </Paper>
    </Box>
  );
};

export default AboutPage;
