import React, { useState, useEffect } from 'react';
import projects from '../info/projects.json';
import { 
  Card, 
  CardContent, 
  Typography, 
  Grid, 
  Chip, 
  Box, 
  Collapse, 
  IconButton, 
  Button 
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon, Code, ArrowForward } from '@mui/icons-material';
import { motion } from 'framer-motion';

// Animation variants for the cards sliding in
const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1, // Stagger effect
      duration: 0.5,
      ease: "easeOut"
    }
  })
};

const ProjectsPage = () => {
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    document.title = "Projects - gsoc.pollinations";
  }, []);

  const handleExpandClick = (index) => {
    setExpanded(expanded === index ? null : index);
  };

  return (
    <Box 
      sx={{ 
        minHeight: '100vh',
        bgcolor: '#09090b', // Zinc-950
        padding: '6rem 2rem',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
       {/* Background Glow Effect */}
       <Box 
        sx={{
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0) 70%)',
          zIndex: 0,
          pointerEvents: 'none'
        }} 
      />

      <Typography 
        variant='h2' 
        align='center' 
        sx={{ 
          marginBottom: '4rem', 
          fontWeight: 700, 
          letterSpacing: '-0.02em',
          background: 'linear-gradient(to right, #fff, #a1a1aa)', // Metallic gradient
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          position: 'relative',
          zIndex: 1
        }}
      >
        Featured Projects
      </Typography>

      <Grid container spacing={4} sx={{ maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {projects && projects.map((project, index) => (
          <Grid item xs={12} md={6} lg={4} key={index}>
            <motion.div
              custom={index}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              <Card 
                elevation={0}
                sx={{ 
                  background: 'rgba(255, 255, 255, 0.03)', // Glass background
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  color: '#fff',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-5px)',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 10px 40px -10px rgba(0,0,0,0.5)'
                  }
                }}
              >
                <CardContent sx={{ padding: '2rem' }}>
                  {/* Title & Icon Header */}
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Box 
                      sx={{ 
                        p: 1, 
                        borderRadius: '8px', 
                        bgcolor: 'rgba(255,255,255,0.05)', 
                        mr: 2,
                        display: 'flex'
                      }}
                    >
                      <Code fontSize="small" sx={{ color: '#a1a1aa' }} />
                    </Box>
                    <Typography variant='h6' sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                      {project.title}
                    </Typography>
                  </Box>

                  <Typography variant="body2" sx={{ marginBottom: '1.5rem', color: '#a1a1aa', minHeight: '3em' }}>
                    {project.description}
                  </Typography>

                  {/* Tech Stack Chips */}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
                    {project.technologies.map((tag, i) => (
                      <Chip
                        label={tag}
                        key={i}
                        size="small"
                        sx={{
                          fontSize: '0.75rem',
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: '#e4e4e7',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          backdropFilter: 'blur(4px)',
                          '&:hover': { background: 'rgba(255,255,255,0.1)' }
                        }}
                      />
                    ))}
                  </Box>

                  {/* Divider */}
                  <Box sx={{ height: '1px', width: '100%', bgcolor: 'rgba(255,255,255,0.1)', mb: 2 }} />

                  {/* Expand Logic */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: '#52525b', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      Details
                    </Typography>
                    <IconButton
                      onClick={() => handleExpandClick(index)}
                      size="small"
                      sx={{ 
                        transform: expanded === index ? 'rotate(180deg)' : 'rotate(0deg)', 
                        transition: 'transform 0.3s',
                        color: expanded === index ? '#fff' : '#71717a',
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}
                    >
                      <ExpandMoreIcon />
                    </IconButton>
                  </Box>

                  <Collapse in={expanded === index} timeout='auto' unmountOnExit>
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                      <Typography variant="body2" sx={{ color: '#d4d4d8', lineHeight: 1.7 }}>
                        {project.longDescription}
                      </Typography>
                      {/* Optional: Add a dummy action button */}
                      <Button 
                        endIcon={<ArrowForward />} 
                        sx={{ mt: 2, textTransform: 'none', color: '#fff' }}
                        size="small"
                      >
                        View Repository
                      </Button>
                    </Box>
                  </Collapse>

                </CardContent>
              </Card>
            </motion.div>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default ProjectsPage;