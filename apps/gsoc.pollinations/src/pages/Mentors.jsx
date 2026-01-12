import React, { useState, useEffect } from 'react';
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
  Avatar,
  Button,
  Stack,
  Divider
} from '@mui/material';
import { 
  ExpandMore as ExpandMoreIcon,
  LinkedIn,
  GitHub,
  Email,
  Work,
  School,
  Star
} from '@mui/icons-material';
import { motion } from 'framer-motion';

// Animation variants
const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.15,
      duration: 0.6,
      ease: "easeOut"
    }
  })
};

const MentorsPage = () => {
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    document.title = "Mentors - GSOC 2026 | pollinations.ai";
  }, []);

  const handleExpandClick = (index) => {
    setExpanded(expanded === index ? null : index);
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

      <Box sx={{ maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
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
            Meet Our Mentors
          </Typography>
          
          <Typography 
            variant='h6' 
            sx={{ 
              color: 'rgba(255,255,255,0.7)', 
              fontWeight: 400,
              maxWidth: '700px',
              margin: '0 auto',
              lineHeight: 1.6
            }}
          >
            Learn from industry experts and experienced open-source contributors who will guide you through your GSOC journey.
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
                {mentors.length}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Expert Mentors
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>
                25+
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Years Combined
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>
                65+
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Projects Mentored
              </Typography>
            </Box>
          </Stack>
        </Box>

        {/* Mentors Grid - 2 per row on normal screens */}
        <Grid container spacing={4}>
          {mentors.map((mentor, index) => (
            <Grid item xs={12} md={6} key={index}>
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
                    height: '100%',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '20px',
                    color: '#fff',
                    transition: 'all 0.4s ease',
                    position: 'relative',
                    overflow: 'hidden',
                    '&:hover': {
                      transform: 'translateY(-8px)',
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
                      background: 'linear-gradient(90deg, #3b82f6, #06b6d4, #10b981)',
                      borderRadius: '20px 20px 0 0'
                    }
                  }}
                >
                  <CardContent sx={{ padding: '2.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {/* Header with Avatar and Basic Info */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, mb: 3 }}>
                      <Avatar
                        src={mentor.imageUrl}
                        sx={{ 
                          width: 80, 
                          height: 80,
                          border: '3px solid rgba(255,255,255,0.2)',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
                        }}
                      >
                        {mentor.name.split(' ').map(n => n[0]).join('')}
                      </Avatar>
                      
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography 
                          variant='h5' 
                          sx={{ 
                            fontWeight: 700, 
                            mb: 0.5,
                            color: '#fff'
                          }}
                        >
                          {mentor.name}
                        </Typography>
                        
                        <Typography 
                          variant='subtitle1' 
                          sx={{ 
                            color: '#60a5fa',
                            fontWeight: 600,
                            mb: 1
                          }}
                        >
                          {mentor.title}
                        </Typography>

                        <Typography 
                          variant="body2" 
                          sx={{ 
                            color: 'rgba(255,255,255,0.8)', 
                            lineHeight: 1.6
                          }}
                        >
                          {mentor.bio}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Stats Row */}
                    <Box sx={{ 
                      display: 'flex', 
                      gap: 3, 
                      mb: 3,
                      p: 2,
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)'
                    }}>
                      <Box sx={{ textAlign: 'center', flexGrow: 1 }}>
                        <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
                          {mentor.yearsExperience}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                          Years Exp.
                        </Typography>
                      </Box>
                      <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                      <Box sx={{ textAlign: 'center', flexGrow: 1 }}>
                        <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
                          {mentor.projects}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                          Projects
                        </Typography>
                      </Box>
                      <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                      <Box sx={{ textAlign: 'center', flexGrow: 1 }}>
                        <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
                          {mentor.expertise.length}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                          Expertise
                        </Typography>
                      </Box>
                    </Box>

                    {/* Core Expertise */}
                    <Box sx={{ mb: 3 }}>
                      <Typography 
                        variant="subtitle2" 
                        sx={{ 
                          color: 'rgba(255,255,255,0.6)', 
                          textTransform: 'uppercase', 
                          letterSpacing: '1px',
                          fontWeight: 600,
                          mb: 1.5,
                          fontSize: '0.8rem'
                        }}
                      >
                        Core Expertise
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={1}>
                        {mentor.expertise.map((skill, i) => (
                          <Chip
                            key={i}
                            label={skill}
                            size="medium"
                            icon={<Star sx={{ fontSize: '16px !important' }} />}
                            sx={{
                              fontSize: '0.8rem',
                              height: '28px',
                              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(16, 185, 129, 0.2))',
                              color: '#e0f2fe',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              fontWeight: 600,
                              '&:hover': { 
                                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(16, 185, 129, 0.3))',
                                transform: 'translateY(-1px)'
                              }
                            }}
                          />
                        ))}
                      </Stack>
                    </Box>

                    {/* Action Buttons */}
                    <Box sx={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      mt: 'auto'
                    }}>
                      {/* Social Links */}
                      <Stack direction="row" spacing={1}>
                        <IconButton
                          component="a"
                          href={mentor.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="small"
                          sx={{
                            color: 'rgba(255,255,255,0.7)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '8px',
                            '&:hover': {
                              color: '#0077b5',
                              borderColor: '#0077b5',
                              backgroundColor: 'rgba(0, 119, 181, 0.1)'
                            }
                          }}
                        >
                          <LinkedIn fontSize="small" />
                        </IconButton>
                        <IconButton
                          component="a"
                          href={mentor.github}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="small"
                          sx={{
                            color: 'rgba(255,255,255,0.7)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '8px',
                            '&:hover': {
                              color: '#fff',
                              borderColor: '#fff',
                              backgroundColor: 'rgba(255,255,255,0.1)'
                            }
                          }}
                        >
                          <GitHub fontSize="small" />
                        </IconButton>
                        <IconButton
                          component="a"
                          href={`mailto:${mentor.email}`}
                          size="small"
                          sx={{
                            color: 'rgba(255,255,255,0.7)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '8px',
                            '&:hover': {
                              color: '#ea4335',
                              borderColor: '#ea4335',
                              backgroundColor: 'rgba(234, 67, 53, 0.1)'
                            }
                          }}
                        >
                          <Email fontSize="small" />
                        </IconButton>
                      </Stack>

                      {/* Expand Button */}
                      <Button
                        variant="outlined"
                        size="small"
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
                          fontSize: '0.875rem',
                          '&:hover': {
                            borderColor: 'rgba(255,255,255,0.4)',
                            color: '#fff',
                            backgroundColor: 'rgba(255,255,255,0.05)'
                          }
                        }}
                      >
                        {expanded === index ? 'Show Less' : 'Learn More'}
                      </Button>
                    </Box>

                    {/* Expandable Content */}
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
                        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.1)' }} />
                        
                        {/* Detailed Bio */}
                        <Typography 
                          variant="h6" 
                          sx={{ 
                            color: '#fff', 
                            fontWeight: 600, 
                            mb: 2,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1
                          }}
                        >
                          <Work sx={{ fontSize: '20px' }} />
                          Professional Background
                        </Typography>
                        
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            color: 'rgba(255,255,255,0.9)', 
                            lineHeight: 1.7,
                            mb: 3
                          }}
                        >
                          {mentor.longDescription}
                        </Typography>

                        {/* All Skills */}
                        <Typography 
                          variant="subtitle2" 
                          sx={{ 
                            color: 'rgba(255,255,255,0.7)', 
                            mb: 2,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1
                          }}
                        >
                          <School sx={{ fontSize: '18px' }} />
                          Technical Skills
                        </Typography>
                        <Stack direction="row" flexWrap="wrap" gap={1}>
                          {mentor.skills.map((skill, i) => (
                            <Chip
                              key={i}
                              label={skill}
                              size="small"
                              sx={{
                                fontSize: '0.75rem',
                                height: '24px',
                                bgcolor: 'rgba(255,255,255,0.08)',
                                color: 'rgba(255,255,255,0.9)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                '&:hover': {
                                  bgcolor: 'rgba(255,255,255,0.15)',
                                  transform: 'translateY(-1px)'
                                }
                              }}
                            />
                          ))}
                        </Stack>
                      </motion.div>
                    </Collapse>

                  </CardContent>
                </Card>
              </motion.div>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
};

export default MentorsPage;
