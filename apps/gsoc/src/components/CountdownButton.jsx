import React, { useState, useEffect } from 'react';
import { Button, Box, Stack, Typography, Tooltip } from '@mui/material';
import { Link } from 'react-router-dom';
import { Timeline as TimelineIcon } from '@mui/icons-material';
import timeline from '../info/timeline.json';

const CountdownButton = () => {
  const [timeRemaining, setTimeRemaining] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });

  useEffect(() => {
    const calculateCountdown = () => {
      // Find the Contributor Application Period (starts 2026-03-16)
      const targetDate = new Date('2026-03-16').getTime();
      const now = new Date().getTime();
      const distance = targetDate - now;

      if (distance > 0) {
        setTimeRemaining({
          days: Math.floor(distance / (1000 * 60 * 60 * 24)),
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000)
        });
      } else {
        // If the date has passed, show 0
        setTimeRemaining({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0
        });
      }
    };

    calculateCountdown();
    const timer = setInterval(calculateCountdown, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <Tooltip title="Until Coding Period Begins" placement="bottom">
    <Button
      component={Link}
      to='/timeline'
      variant="outlined"
      size="large"
      sx={{
        borderColor: 'rgba(255,255,255,0.3)',
        color: '#fff',
        textTransform: 'none',
        fontSize: '1.1rem',
        py: 2,
        px: 4,
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        '&:hover': {
          borderColor: 'rgba(255,255,255,0.5)',
          backgroundColor: 'rgba(255,255,255,0.05)'
        }
      }}
    >
        
    
      <Stack 
        direction="row" 
        spacing={1} 
        sx={{ 
          fontSize: '0.8rem',
          opacity: 0.8,
          justifyContent: 'center'
        }}
      >
        <Tooltip title="Ask SocBot - Your AI Assistant" placement="bottom"></Tooltip>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', fontSize: '1rem' }}>
            {timeRemaining.days}
          </Typography>
        </Box>
        <Typography sx={{fontSize: '1rem'}} variant="caption">:</Typography>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', fontSize: '1rem' }}>
            {String(timeRemaining.hours).padStart(2, '0')}
          </Typography>
        </Box>
        <Typography sx={{fontSize: '1rem'}} variant="caption">:</Typography>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', fontSize: '1rem' }}>
            {String(timeRemaining.minutes).padStart(2, '0')}
          </Typography>
        </Box>
        <Typography sx={{fontSize: '1rem'}} variant="caption">:</Typography>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', fontSize: '1rem' }}>
            {String(timeRemaining.seconds).padStart(2, '0')}
          </Typography>
        </Box>
      </Stack>
      
    </Button>
    </Tooltip>
  );
};

export default CountdownButton;
