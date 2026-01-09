import React from 'react';
import { Box, Typography, Stepper, Step, StepLabel, StepContent } from '@mui/material';
import gsocTimeline from '../data/timeline.json';

const TimelinePage = () => {
  const today = new Date();
  const currentPhaseIndex = gsocTimeline.findIndex(phase => new Date(phase.endDate) > today);

  return (
    <Box sx={{ padding: '4rem 2rem' }}>
      <Typography variant='h2' align='center' gutterBottom sx={{ marginBottom: '3rem' }}>
        Google Summer of Code Timeline
      </Typography>
      <Stepper activeStep={currentPhaseIndex} orientation='vertical' sx={{ '& .MuiStepConnector-line': { borderColor: 'rgba(255, 255, 255, 0.3)' } }}>
        {gsocTimeline.map((phase, index) => (
          <Step key={index}>
            <StepLabel 
              sx={{ '& .MuiStepLabel-label': { color: '#fff' } }} 
              StepIconProps={{ sx: { '&.Mui-active': { color: 'primary.main' }, '&.Mui-completed': { color: 'primary.main' }, color: 'rgba(255, 255, 255, 0.5)' } }}
            >
              <Typography variant='h5'>{phase.title}</Typography>
            </StepLabel>
            <StepContent sx={{ borderColor: 'rgba(255, 255, 255, 0.3)' }}>
              <Typography sx={{ color: 'text.secondary' }}>{phase.description}</Typography>
              <Typography variant='body2' sx={{ color: 'text.secondary', marginTop: '0.5rem' }}>
                {phase.startDate} - {phase.endDate}
              </Typography>
            </StepContent>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
};

export default TimelinePage;
