import React, { useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Grid,
  Card,
  CardContent,
  Chip,
  Stack,
  Button,
  Avatar,
  Divider
} from '@mui/material';
import { 
  Code, 
  Psychology, 
  Groups, 
  School,
  Rocket,
  GitHub,
  Language,
  EmojiEvents,
  Timeline as TimelineIcon
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

const AboutPage = () => {
  useEffect(() => {
    document.title = "About - GSOC 2026 | pollinations.ai";
  }, []);

  const stats = [
    { number: "2026", label: "Program Year", icon: <EmojiEvents /> },
    { number: "3+", label: "Project Categories", icon: <Code /> },
    { number: "150+", label: "Expected Contributors", icon: <Groups /> },
    { number: "12", label: "Week Program", icon: <TimelineIcon /> }
  ];

  const features = [
    {
      icon: <Psychology />,
      title: "AI-Powered Innovation",
      description: "Work on cutting-edge AI projects that push the boundaries of artificial intelligence and machine learning."
    },
    {
      icon: <Code />,
      title: "Open Source Excellence",
      description: "Contribute to meaningful open-source projects that impact developers and researchers worldwide."
    },
    {
      icon: <Groups />,
      title: "Expert Mentorship",
      description: "Learn from industry professionals and experienced open-source contributors who guide your journey."
    },
    {
      icon: <School />,
      title: "Skill Development",
      description: "Enhance your technical skills while building real-world projects that matter to the community."
    }
  ];

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
        {/* Hero Section */}
        <Box sx={{ textAlign: 'center', mb: 8 }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <Typography 
              variant='h1' 
              sx={{ 
                marginBottom: '1rem', 
                fontWeight: 700, 
                letterSpacing: '-0.02em',
                background: 'linear-gradient(to bottom right, #fff, #a1a1aa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontSize: { xs: '2.5rem', md: '3.5rem' }
              }}
            >
              About pollinations.ai
            </Typography>
            
            <Typography 
              variant='h4' 
              sx={{ 
                color: '#60a5fa',
                fontWeight: 600,
                mb: 2,
                fontSize: { xs: '1.5rem', md: '2rem' }
              }}
            >
              Google Summer of Code 2026
            </Typography>

            <Typography 
              variant='h6' 
              sx={{ 
                color: 'rgba(255,255,255,0.8)', 
                fontWeight: 400,
                maxWidth: '800px',
                margin: '0 auto',
                lineHeight: 1.6,
                mb: 4
              }}
            >
              Join us in building the future of AI and open source technology. Pollinations.ai is 
              a cutting-edge platform that democratizes AI-generated media creation, and we're 
              excited to mentor the next generation of developers and researchers.
            </Typography>

            <Stack 
              direction={{ xs: 'column', sm: 'row' }} 
              spacing={3} 
              justifyContent="center"
              alignItems="center"
            >
              <Button
                variant="contained"
                size="large"
                startIcon={<Rocket />}
                sx={{
                  bgcolor: 'rgba(255,255,255,0.15)',
                  color: '#fff',
                  textTransform: 'none',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  py: 1.5,
                  px: 4,
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.25)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 25px rgba(0,0,0,0.3)'
                  }
                }}
              >
                Get Started
              </Button>
              <Button
                variant="outlined"
                size="large"
                startIcon={<GitHub />}
                sx={{
                  borderColor: 'rgba(255,255,255,0.3)',
                  color: '#fff',
                  textTransform: 'none',
                  fontSize: '1.1rem',
                  py: 1.5,
                  px: 4,
                  '&:hover': {
                    borderColor: 'rgba(255,255,255,0.5)',
                    backgroundColor: 'rgba(255,255,255,0.05)'
                  }
                }}
              >
                View Projects
              </Button>
            </Stack>
          </motion.div>
        </Box>

        {/* Stats Section */}
        <Box sx={{ mb: 8 }}>
          <Grid container spacing={4}>
            {stats.map((stat, index) => (
              <Grid item xs={6} md={3} key={index}>
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
                      borderRadius: '16px',
                      color: '#fff',
                      textAlign: 'center',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        borderColor: 'rgba(255,255,255,0.3)',
                        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.4)'
                      }
                    }}
                  >
                    <CardContent sx={{ p: 3 }}>
                      <Box sx={{ mb: 2, color: '#60a5fa' }}>
                        {stat.icon}
                      </Box>
                      <Typography variant="h3" sx={{ fontWeight: 700, mb: 1, color: '#fff' }}>
                        {stat.number}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {stat.label}
                      </Typography>
                    </CardContent>
                  </Card>
                </motion.div>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* What Makes Us Special */}
        <Box sx={{ mb: 8 }}>
          <Typography 
            variant='h3' 
            sx={{ 
              textAlign: 'center',
              marginBottom: '3rem', 
              fontWeight: 700, 
              color: '#fff'
            }}
          >
            What Makes Us Special
          </Typography>
          
          <Grid container spacing={4}>
            {features.map((feature, index) => (
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
                      borderRadius: '16px',
                      color: '#fff',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        borderColor: 'rgba(255,255,255,0.3)',
                        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.4)'
                      }
                    }}
                  >
                    <CardContent sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Box 
                          sx={{ 
                            p: 1.5, 
                            borderRadius: '12px', 
                            bgcolor: 'rgba(96, 165, 250, 0.1)', 
                            border: '1px solid rgba(96, 165, 250, 0.2)',
                            color: '#60a5fa'
                          }}
                        >
                          {feature.icon}
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff' }}>
                          {feature.title}
                        </Typography>
                      </Box>
                      <Typography 
                        variant="body1" 
                        sx={{ 
                          color: 'rgba(255,255,255,0.8)', 
                          lineHeight: 1.6,
                          flexGrow: 1
                        }}
                      >
                        {feature.description}
                      </Typography>
                    </CardContent>
                  </Card>
                </motion.div>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Organization Info */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <Card
            elevation={0}
            sx={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '20px',
              color: '#fff',
              mb: 6,
              position: 'relative',
              overflow: 'hidden',
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
            <CardContent sx={{ p: 4 }}>
              <Grid container spacing={4} alignItems="center">
                <Grid item xs={12} md={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Avatar
                      sx={{
                        width: 120,
                        height: 120,
                        bgcolor: 'rgba(255,255,255,0.1)',
                        border: '3px solid rgba(255,255,255,0.2)',
                        mb: 2,
                        mx: 'auto',
                        fontSize: '2rem',
                        fontWeight: 700
                      }}
                    >
                      P.AI
                    </Avatar>
                    <Chip
                      label="GSOC Organization"
                      sx={{
                        bgcolor: 'rgba(34, 197, 94, 0.2)',
                        color: '#4ade80',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        fontWeight: 600
                      }}
                    />
                  </Box>
                </Grid>
                <Grid item xs={12} md={8}>
                  <Typography variant="h4" sx={{ fontWeight: 700, mb: 2, color: '#fff' }}>
                    pollinations.ai
                  </Typography>
                  <Typography variant="h6" sx={{ color: '#60a5fa', mb: 3 }}>
                    Democratizing AI-Generated Media Creation
                  </Typography>
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      color: 'rgba(255,255,255,0.9)', 
                      lineHeight: 1.7,
                      mb: 3
                    }}
                  >
                    Pollinations.ai is a cutting-edge platform that makes AI-generated media creation 
                    accessible to everyone. We're building tools and infrastructure that democratize 
                    access to AI models, enabling creators, developers, and researchers to easily 
                    integrate AI-generated content into their projects.
                  </Typography>
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      color: 'rgba(255,255,255,0.9)', 
                      lineHeight: 1.7,
                      mb: 3
                    }}
                  >
                    Our mission is to bridge the gap between complex AI technologies and practical 
                    applications, fostering innovation and creativity in the open-source community.
                  </Typography>

                  <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.1)' }} />
                  
                  {/* Contact Information */}
                  <Box>
                    <Typography variant="h6" sx={{ color: '#fff', mb: 2, fontWeight: 600 }}>
                      Get In Touch
                    </Typography>
                    <Stack spacing={2}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                          Program Coordinator:
                        </Typography>
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            color: '#60a5fa',
                            fontFamily: 'monospace',
                            cursor: 'pointer',
                            '&:hover': { color: '#93c5fd' }
                          }}
                        >
                          ayushman@myceli.ai
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                          General Inquiries:
                        </Typography>
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            color: '#60a5fa',
                            fontFamily: 'monospace',
                            cursor: 'pointer',
                            '&:hover': { color: '#93c5fd' }
                          }}
                        >
                          core@pollinations.ai
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </motion.div>

        {/* Call to Action */}
        <Box sx={{ textAlign: 'center' }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700, mb: 2 }}>
              Ready to Make an Impact?
            </Typography>
            <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)', mb: 4, maxWidth: '600px', mx: 'auto' }}>
              Join our community of innovators and help shape the future of AI technology through open source collaboration.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
              <Button
                variant="contained"
                size="large"
                startIcon={<Language />}
                sx={{
                  bgcolor: 'rgba(255,255,255,0.15)',
                  color: '#fff',
                  textTransform: 'none',
                  fontSize: '1rem',
                  fontWeight: 600,
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.25)'
                  }
                }}
              >
                Visit Our Website
              </Button>
              <Button
                variant="outlined"
                size="large"
                startIcon={<GitHub />}
                sx={{
                  borderColor: 'rgba(255,255,255,0.3)',
                  color: '#fff',
                  textTransform: 'none',
                  fontSize: '1rem',
                  '&:hover': {
                    borderColor: 'rgba(255,255,255,0.5)',
                    backgroundColor: 'rgba(255,255,255,0.05)'
                  }
                }}
              >
                View on GitHub
              </Button>
            </Stack>
          </motion.div>
        </Box>
      </Box>
    </Box>
  );
};

export default AboutPage;
