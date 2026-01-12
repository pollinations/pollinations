import React, { useEffect } from 'react';
import { Box, Typography, Paper, useTheme, useMediaQuery } from '@mui/material';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import gsocTimeline from '../info/timeline.json'; // Ensure path is correct

// 1. Animation Variants for Scroll Effects
const cardVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" }
  }
};

const TimelinePage = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const today = new Date();

  // Fix: Move side effects out of render
  useEffect(() => {
    document.title = "Timeline - GSOC 2026";
  }, []);

  return (
    <Box 
      sx={{ 
        minHeight: '100vh', 
        bgcolor: '#09090b', // Shadcn-like dark background (zinc-950)
        color: '#fff',
        padding: '4rem 2rem',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Background Ambience (Metallic/Glass Glow) */}
      <Box 
        sx={{
          position: 'absolute',
          top: '-10%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0) 70%)',
          zIndex: 0,
          pointerEvents: 'none'
        }} 
      />

      <Typography 
        variant='h2' 
        align='center' 
        sx={{ 
          marginBottom: '5rem', 
          fontWeight: 700, 
          letterSpacing: '-0.02em',
          background: 'linear-gradient(to bottom right, #fff, #a1a1aa)', // Metallic gradient text
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          zIndex: 1,
          position: 'relative'
        }}
      >
        GSOC 2026 Roadmap
      </Typography>

      <Box sx={{ maxWidth: '1000px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        
        {/* Central Line */}
        <Box 
          sx={{
            position: 'absolute',
            left: isMobile ? '20px' : '50%',
            top: 0,
            bottom: 0,
            width: '2px',
            background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.2) 10%, rgba(255,255,255,0.2) 90%, rgba(255,255,255,0))',
            transform: isMobile ? 'none' : 'translateX(-50%)'
          }}
        />

        {gsocTimeline.map((phase, index) => {
          const startDate = parseISO(phase.startDate);
          const endDate = parseISO(phase.endDate);
          const isActive = today >= startDate && today <= endDate;
          const isPast = today > endDate;

          return (
            <motion.div
              key={index}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
            >
              <Box 
                sx={{
                  display: 'flex',
                  justifyContent: isMobile ? 'flex-start' : (index % 2 === 0 ? 'flex-end' : 'flex-start'),
                  position: 'relative',
                  mb: 6,
                  pl: isMobile ? '60px' : 0
                }}
              >
                {/* Timeline Dot */}
                <Box 
                  sx={{
                    position: 'absolute',
                    left: isMobile ? '20px' : '50%',
                    top: '25px',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    bgcolor: isActive ? '#fff' : '#09090b', // Active = White, Inactive = Dark
                    border: '2px solid',
                    borderColor: isActive ? '#fff' : (isPast ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)'),
                    transform: 'translate(-50%, -50%)',
                    zIndex: 2,
                    boxShadow: isActive ? '0 0 20px rgba(255,255,255,0.6)' : 'none',
                    transition: 'all 0.3s ease'
                  }}
                />

                {/* Glass Card */}
                <Paper
                  elevation={0}
                  sx={{
                    width: isMobile ? '100%' : '45%',
                    p: 3,
                    background: 'rgba(255, 255, 255, 0.03)', // Glass background
                    backdropFilter: 'blur(10px)',
                    border: '1px solid',
                    borderColor: isActive ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    transition: 'transform 0.3s ease',
                    '&:hover': {
                      borderColor: 'rgba(255,255,255,0.2)',
                      background: 'rgba(255, 255, 255, 0.05)',
                    }
                  }}
                >
                  {/* Date Badge */}
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      display: 'inline-block',
                      mb: 1,
                      px: 1.5,
                      py: 0.5,
                      borderRadius: '99px',
                      bgcolor: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.7)',
                      fontFamily: 'monospace'
                    }}
                  >
                    {format(startDate, 'MMM dd')} - {format(endDate, 'MMM dd')}
                  </Typography>

                  <Typography variant="h5" sx={{ fontWeight: 600, mb: 1, color: isActive ? '#fff' : '#e4e4e7' }}>
                    {phase.title}
                  </Typography>
                  
                  <Typography variant="body2" sx={{ color: '#a1a1aa', lineHeight: 1.6 }}>
                    {phase.description}
                  </Typography>
                </Paper>
              </Box>
            </motion.div>
          );
        })}
      </Box>
    </Box>
  );
};

export default TimelinePage;