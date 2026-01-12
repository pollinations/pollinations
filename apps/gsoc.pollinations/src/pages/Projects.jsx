import React, { useState, useEffect } from 'react';
import projects from '../info/projects.json';
import mentors from '../info/mentors.json';
import { 
  Card, 
  CardContent, 
  Typography, 
  Grid, 
  Chip, 
  Box, 
  Collapse, 
  IconButton, 
  Button,
  Avatar,
  Stack,
  Divider,
  LinearProgress
} from '@mui/material';
import { 
  ExpandMore as ExpandMoreIcon, 
  Code, 
  ArrowForward,
  GitHub,
  Schedule,
  Person,
  Lightbulb,
  Assignment,
  Star
} from '@mui/icons-material';
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
    document.title = "Project Ideas - GSOC 2026 | pollinations.ai";
  }, []);

  const handleExpandClick = (index) => {
    setExpanded(expanded === index ? null : index);
  };

  // Enhanced project meta data based on actual project content
  const getProjectMeta = (project, index) => {
    // Determine category based on technologies
    let category = 'Web Development';
    if (project.technologies.some(tech => ['Python', 'Machine Learning', 'TensorFlow', 'PyTorch'].includes(tech))) {
      category = 'AI/ML';
    } else if (project.technologies.some(tech => ['Ethereum', 'IPFS', 'Blockchain'].includes(tech))) {
      category = 'Blockchain';
    }

    // Determine difficulty based on technology stack complexity
    let difficulty = 'Intermediate';
    if (project.technologies.includes('Machine Learning') || project.technologies.includes('Ethereum')) {
      difficulty = 'Advanced';
    } else if (project.technologies.includes('React') && project.technologies.length <= 2) {
      difficulty = 'Beginner';
    }

    // Assign mentor from actual mentors.json
    const assignedMentor = mentors[index % mentors.length];
    
    return {
      difficulty,
      duration: difficulty === 'Beginner' ? '175 hours' : '350 hours',
      mentor: assignedMentor,
      applications: Math.floor(Math.random() * 25) + 5,
      category
    };
  };

  return (
    <Box 
      sx={{ 
        minHeight: '100vh',
        bgcolor: '#09090b',
        padding: '2rem 2rem 4rem',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
       {/* Background Glow Effects */}
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

      <Box sx={{ maxWidth: '1400px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* Header Section */}
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography 
            variant='h2' 
            sx={{ 
              marginBottom: '1rem', 
              fontWeight: 700, 
              letterSpacing: '-0.02em',
              background: 'linear-gradient(to bottom right, #fff, #a1a1aa)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}
          >
            GSOC 2026 Project Ideas
          </Typography>
          
          <Typography 
            variant='h6' 
            sx={{ 
              color: 'rgba(255,255,255,0.7)', 
              fontWeight: 400,
              maxWidth: '800px',
              margin: '0 auto',
              lineHeight: 1.6
            }}
          >
            Explore cutting-edge projects in AI, decentralization, and collaborative tools. 
            Join us in building the future of open source technology.
          </Typography>

          {/* Stats Section */}
          <Stack 
            direction={{ xs: 'column', md: 'row' }} 
            spacing={4} 
            sx={{ 
              mt: 4, 
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>
                {projects.length}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Active Projects
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>
                3
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Categories
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>
                50+
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Expected Contributors
              </Typography>
            </Box>
          </Stack>
        </Box>

        {/* Projects Grid - Full Width Layout */}
        <Grid container spacing={4}>
          {projects && projects.map((project, index) => {
            const meta = getProjectMeta(project, index);
            
            return (
              <Grid item xs={12} key={index}>
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
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '20px',
                      color: '#fff',
                      transition: 'all 0.4s ease',
                      position: 'relative',
                      overflow: 'hidden',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        borderColor: 'rgba(255,255,255,0.3)',
                        boxShadow: '0 25px 50px -10px rgba(0,0,0,0.5)'
                      },
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '4px',
                        background: `linear-gradient(90deg, ${
                          meta.category === 'AI/ML' ? '#f59e0b, #d97706' :
                          meta.category === 'Blockchain' ? '#3b82f6, #1d4ed8' :
                          '#10b981, #059669'
                        })`,
                        borderRadius: '20px 20px 0 0'
                      }
                    }}
                  >
                    <CardContent sx={{ padding: '2.5rem' }}>
                      <Grid container spacing={4} alignItems="center">
                        {/* Left Section - Project Info */}
                        <Grid item xs={12} md={8}>
                          {/* Header with Category & Difficulty */}
                          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 3 }}>
                            <Chip
                              label={meta.category}
                              size="medium"
                              icon={<Lightbulb sx={{ fontSize: '18px !important' }} />}
                              sx={{
                                bgcolor: meta.category === 'AI/ML' ? 'rgba(245, 158, 11, 0.1)' :
                                        meta.category === 'Blockchain' ? 'rgba(59, 130, 246, 0.1)' :
                                        'rgba(16, 185, 129, 0.1)',
                                color: meta.category === 'AI/ML' ? '#fbbf24' :
                                       meta.category === 'Blockchain' ? '#60a5fa' :
                                       '#34d399',
                                border: `1px solid ${
                                  meta.category === 'AI/ML' ? 'rgba(245, 158, 11, 0.3)' :
                                  meta.category === 'Blockchain' ? 'rgba(59, 130, 246, 0.3)' :
                                  'rgba(16, 185, 129, 0.3)'
                                }`,
                                fontWeight: 600,
                                fontSize: '0.875rem',
                                height: '32px'
                              }}
                            />
                            <Chip
                              label={meta.difficulty}
                              size="medium"
                              sx={{
                                bgcolor: meta.difficulty === 'Beginner' ? 'rgba(34, 197, 94, 0.1)' :
                                        meta.difficulty === 'Intermediate' ? 'rgba(251, 191, 36, 0.1)' :
                                        'rgba(239, 68, 68, 0.1)',
                                color: meta.difficulty === 'Beginner' ? '#4ade80' :
                                       meta.difficulty === 'Intermediate' ? '#fbbf24' :
                                       '#f87171',
                                border: `1px solid ${
                                  meta.difficulty === 'Beginner' ? 'rgba(34, 197, 94, 0.3)' :
                                  meta.difficulty === 'Intermediate' ? 'rgba(251, 191, 36, 0.3)' :
                                  'rgba(239, 68, 68, 0.3)'
                                }`,
                                fontWeight: 600,
                                fontSize: '0.875rem',
                                height: '32px'
                              }}
                            />
                            <Chip
                              label={meta.duration}
                              size="medium"
                              icon={<Schedule sx={{ fontSize: '18px !important' }} />}
                              sx={{
                                bgcolor: 'rgba(156, 163, 175, 0.1)',
                                color: '#d1d5db',
                                border: '1px solid rgba(156, 163, 175, 0.2)',
                                fontWeight: 600,
                                fontSize: '0.875rem',
                                height: '32px'
                              }}
                            />
                          </Box>

                          {/* Project Title */}
                          <Typography 
                            variant='h4' 
                            sx={{ 
                              fontWeight: 700, 
                              mb: 2,
                              lineHeight: 1.2,
                              color: '#fff',
                              fontSize: { xs: '1.75rem', md: '2rem' }
                            }}
                          >
                            {project.title}
                          </Typography>

                          {/* Project Description */}
                          <Typography 
                            variant="body1" 
                            sx={{ 
                              color: 'rgba(255,255,255,0.8)', 
                              lineHeight: 1.7,
                              mb: 3,
                              fontSize: '1.1rem'
                            }}
                          >
                            {project.description}
                          </Typography>

                          {/* Technologies */}
                          <Box sx={{ mb: 3 }}>
                            <Typography 
                              variant="subtitle2" 
                              sx={{ 
                                color: 'rgba(255,255,255,0.6)', 
                                textTransform: 'uppercase', 
                                letterSpacing: '1px',
                                fontWeight: 600,
                                mb: 2,
                                fontSize: '0.8rem'
                              }}
                            >
                              Required Technologies
                            </Typography>
                            <Stack direction="row" flexWrap="wrap" gap={1.5}>
                              {project.technologies.map((tech, i) => (
                                <Chip
                                  label={tech}
                                  key={i}
                                  size="medium"
                                  sx={{
                                    fontSize: '0.85rem',
                                    height: '28px',
                                    background: 'rgba(255,255,255,0.1)',
                                    color: '#f3f4f6',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    fontWeight: 500,
                                    '&:hover': { 
                                      background: 'rgba(255,255,255,0.2)',
                                      transform: 'translateY(-1px)',
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                    }
                                  }}
                                />
                              ))}
                            </Stack>
                          </Box>
                        </Grid>

                        {/* Right Section - Mentor & Actions */}
                        <Grid item xs={12} md={4}>
                          <Box sx={{ 
                            p: 3, 
                            borderRadius: '16px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                          }}>
                            {/* Mentor Info */}
                            <Box>
                              <Typography 
                                variant="caption" 
                                sx={{ 
                                  color: 'rgba(255,255,255,0.6)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px',
                                  fontWeight: 600,
                                  mb: 2,
                                  display: 'block'
                                }}
                              >
                                Project Mentor
                              </Typography>
                              
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                <Avatar 
                                  src={meta.mentor.imageUrl}
                                  sx={{ 
                                    width: 48, 
                                    height: 48,
                                    border: '2px solid rgba(255,255,255,0.2)'
                                  }}
                                >
                                  {meta.mentor.name.split(' ').map(n => n[0]).join('')}
                                </Avatar>
                                <Box>
                                  <Typography variant="h6" sx={{ color: '#fff', fontWeight: 600 }}>
                                    {meta.mentor.name}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                    {meta.mentor.bio}
                                  </Typography>
                                </Box>
                              </Box>

                              {/* Mentor Expertise */}
                              <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: 3 }}>
                                {meta.mentor.expertise.slice(0, 3).map((skill, i) => (
                                  <Chip
                                    key={i}
                                    label={skill}
                                    size="small"
                                    sx={{
                                      fontSize: '0.7rem',
                                      height: '20px',
                                      bgcolor: 'rgba(255,255,255,0.05)',
                                      color: 'rgba(255,255,255,0.7)',
                                      border: '1px solid rgba(255,255,255,0.1)'
                                    }}
                                  />
                                ))}
                              </Stack>

                              {/* Stats */}
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                                <Box sx={{ textAlign: 'center' }}>
                                  <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
                                    {meta.applications}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                    Applicants
                                  </Typography>
                                </Box>
                                <Box sx={{ textAlign: 'center' }}>
                                  <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
                                    {project.technologies.length}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                    Technologies
                                  </Typography>
                                </Box>
                              </Box>
                            </Box>

                            {/* Action Buttons */}
                            <Stack spacing={2}>
                              <Button
                                variant="contained"
                                size="large"
                                startIcon={<Assignment />}
                                sx={{
                                  bgcolor: 'rgba(255,255,255,0.15)',
                                  color: '#fff',
                                  textTransform: 'none',
                                  fontSize: '1rem',
                                  fontWeight: 600,
                                  py: 1.5,
                                  '&:hover': {
                                    bgcolor: 'rgba(255,255,255,0.25)',
                                    transform: 'translateY(-1px)',
                                    boxShadow: '0 8px 25px rgba(0,0,0,0.3)'
                                  }
                                }}
                              >
                                Apply for Project
                              </Button>
                              
                              <Button
                                variant="outlined"
                                size="large"
                                onClick={() => handleExpandClick(index)}
                                endIcon={
                                  <ExpandMoreIcon 
                                    sx={{ 
                                      transform: expanded === index ? 'rotate(180deg)' : 'rotate(0deg)',
                                      transition: 'transform 0.3s ease'
                                    }} 
                                  />
                                }
                                sx={{
                                  borderColor: 'rgba(255,255,255,0.2)',
                                  color: 'rgba(255,255,255,0.8)',
                                  textTransform: 'none',
                                  fontSize: '1rem',
                                  py: 1.5,
                                  '&:hover': {
                                    borderColor: 'rgba(255,255,255,0.4)',
                                    color: '#fff',
                                    backgroundColor: 'rgba(255,255,255,0.05)'
                                  }
                                }}
                              >
                                {expanded === index ? 'Hide Details' : 'View Details'}
                              </Button>
                            </Stack>
                          </Box>
                        </Grid>
                      </Grid>

                      {/* Expandable Detailed Content */}
                      <Collapse 
                        in={expanded === index} 
                        timeout={600}
                        sx={{
                          '& .MuiCollapse-wrapper': {
                            transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1) !important'
                          }
                        }}
                      >
                        <motion.div
                          initial={{ opacity: 0, y: -20 }}
                          animate={{ 
                            opacity: expanded === index ? 1 : 0, 
                            y: expanded === index ? 0 : -20 
                          }}
                          transition={{ duration: 0.4, delay: 0.1 }}
                        >
                          <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.1)' }} />
                          
                          <Grid container spacing={4}>
                            {/* Detailed Description */}
                            <Grid item xs={12} md={8}>
                              <Typography 
                                variant="h5" 
                                sx={{ 
                                  color: '#fff', 
                                  fontWeight: 600, 
                                  mb: 3,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1
                                }}
                              >
                                <Assignment sx={{ fontSize: '24px' }} />
                                Detailed Project Description
                              </Typography>
                              
                              <Typography 
                                variant="body1" 
                                sx={{ 
                                  color: 'rgba(255,255,255,0.9)', 
                                  lineHeight: 1.8,
                                  mb: 4,
                                  fontSize: '1.1rem'
                                }}
                              >
                                {project.longDescription}
                              </Typography>

                              {/* Action Buttons */}
                              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                <Button 
                                  variant="contained"
                                  startIcon={<GitHub />}
                                  size="large"
                                  sx={{
                                    bgcolor: 'rgba(255,255,255,0.1)',
                                    color: '#fff',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    py: 1.5,
                                    px: 3,
                                    '&:hover': {
                                      bgcolor: 'rgba(255,255,255,0.2)',
                                      transform: 'translateY(-2px)'
                                    }
                                  }}
                                >
                                  View Repository
                                </Button>
                                <Button 
                                  variant="outlined"
                                  endIcon={<ArrowForward />}
                                  size="large"
                                  sx={{
                                    borderColor: 'rgba(255,255,255,0.2)',
                                    color: 'rgba(255,255,255,0.8)',
                                    textTransform: 'none',
                                    py: 1.5,
                                    px: 3,
                                    '&:hover': {
                                      borderColor: 'rgba(255,255,255,0.4)',
                                      color: '#fff',
                                      backgroundColor: 'rgba(255,255,255,0.05)'
                                    }
                                  }}
                                >
                                  Documentation
                                </Button>
                              </Stack>
                            </Grid>
                            <Grid item xs={12} md={4}>
                              <Box sx={{ 
                                p: 3, 
                                borderRadius: '16px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)'
                              }}>
                              </Box>
                            </Grid>
                          </Grid>
                        </motion.div>
                      </Collapse>
                    </CardContent>
                  </Card>
                </motion.div>
              </Grid>
            );
          })}
        </Grid>
      </Box>
    </Box>
  );
};

export default ProjectsPage;