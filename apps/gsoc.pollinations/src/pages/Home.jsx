import React, { useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  Grid, 
  Card,
  CardContent,
  Stack,
  Chip,
  Divider,
  Avatar,
  Tooltip,
  IconButton
} from '@mui/material';
import { Link } from 'react-router-dom';
import { 
  ArrowForward, 
  Code, 
  School, 
  Group, 
  Timeline as TimelineIcon,
  EmojiEvents,
  Rocket,
  GitHub,
  VerifiedUser,
  MenuBook,
  Gavel,
  Info
} from '@mui/icons-material';
import { motion } from 'framer-motion';

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.6,
      ease: "easeOut"
    }
  })
};

const HomePage = () => {
  useEffect(() => {
    document.title = "GSOC 2026 × pollinations.ai - Build the Future of AI";
  }, []);

  const highlights = [
    {
      icon: <Code />,
      title: "Open Source Excellence",
      description: "Contribute to cutting-edge AI projects that impact millions of users worldwide."
    },
    {
      icon: <School />,
      title: "Expert Mentorship",
      description: "Learn from industry professionals and experienced open-source maintainers."
    },
    {
      icon: <Group />,
      title: "Global Community",
      description: "Join a worldwide network of developers, researchers, and AI enthusiasts."
    }
  ];

  const stats = [
    { number: "12", label: "Weeks", icon: <TimelineIcon /> },
    { number: "3+", label: "Projects", icon: <Code /> },
    { number: "5K+", label: "Pollens", icon: <EmojiEvents /> }
  ];

  const navigationItems = [
    { icon: <Rocket />, path: '/about', tooltip: 'About Us' },
    { icon: <VerifiedUser />, path: '/mentors', tooltip: 'Meet Our Mentors' },
    { icon: <MenuBook />, path: '/contributing', tooltip: 'Contributing Guide' },
    { icon: <Gavel />, path: '/code-of-conduct', tooltip: 'Code of Conduct' }
  ];

  return (
    <Box 
      sx={{ 
        minHeight: '100vh',
        bgcolor: '#09090b',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Background Effects */}
      <Box 
        sx={{
          position: 'absolute',
          top: '-20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '800px',
          height: '800px',
          background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0) 70%)',
          zIndex: 0,
          pointerEvents: 'none'
        }} 
      />
      
      <Box 
        sx={{
          position: 'absolute',
          top: '20%',
          right: '-10%',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(96, 165, 250, 0.1) 0%, rgba(0,0,0,0) 70%)',
          zIndex: 0,
          pointerEvents: 'none'
        }} 
      />

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        {/* Hero Section */}
        <Box sx={{ 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center',
          px: { xs: 2, md: 4 },
          py: 8
        }}>
          <Box sx={{ maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
            {/* Main Content - Centered */}
            <Grid container spacing={6} alignItems="center" justifyContent="center">
              {/* Left Side - Content */}
              <Grid item xs={12} lg={7}>
                <motion.div
                  variants={fadeInUp}
                  initial="hidden"
                  animate="visible"
                  custom={0}
                >
                  {/* Logo Partnership */}
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 3,
                    mb: 4,
                    flexWrap: 'wrap',
                    justifyContent: { xs: 'center', lg: 'flex-start' }
                  }}>
                    {/* GSOC Logo */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <img 
                        src="/gsoc_logo.webp" 
                        alt="Google Summer of Code"
                        style={{ 
                          height: '60px',
                          filter: 'brightness(1.1)'
                        }}
                      />
                    </Box>
                    
                    {/* Partnership Indicator */}
                    <Typography 
                      variant="h4" 
                      sx={{ 
                        color: 'rgba(255,255,255,0.6)',
                        fontWeight: 300,
                        mx: 1
                      }}
                    >
                      ×
                    </Typography>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <img 
                        src="/polli_white.svg" 
                        alt="Pollinations.ai"
                        style={{ 
                          height: '50px'
                        }}
                      />
                    </Box>
                  </Box>

                  {/* Main Heading */}
                  <Typography 
                    variant='h1' 
                    sx={{ 
                      fontWeight: 700,
                      letterSpacing: '-0.02em',
                      background: 'linear-gradient(135deg, #fff 0%, #60a5fa 50%, #a1a1aa 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      fontSize: { xs: '2.5rem', md: '3.5rem', lg: '4rem' },
                      lineHeight: 1.1,
                      mb: 3
                    }}
                  >
                    Build the Future of AI with Open Source
                  </Typography>

                  {/* Subtitle */}
                  <Typography 
                    variant='h5' 
                    sx={{ 
                      color: 'rgba(255,255,255,0.8)',
                      fontWeight: 400,
                      lineHeight: 1.4,
                      mb: 4,
                      maxWidth: '600px'
                    }}
                  >
                    Join Google Summer of Code 2026 and contribute to cutting-edge AI projects 
                    that democratize artificial intelligence for everyone.
                  </Typography>

                  {/* CTA Buttons */}
                  <Stack 
                    direction={{ xs: 'column', sm: 'row' }} 
                    spacing={3}
                    sx={{ mb: 6 }}
                  >
                    <Button
                      component={Link}
                      to='/projects'
                      variant="contained"
                      size="large"
                      endIcon={<ArrowForward />}
                      sx={{
                        bgcolor: 'rgba(255,255,255,0.15)',
                        color: '#fff',
                        textTransform: 'none',
                        fontSize: '1.1rem',
                        fontWeight: 600,
                        py: 2,
                        px: 4,
                        borderRadius: '12px',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        '&:hover': {
                          bgcolor: 'rgba(255,255,255,0.25)',
                          transform: 'translateY(-2px)',
                          boxShadow: '0 8px 32px rgba(255,255,255,0.15)'
                        }
                      }}
                    >
                      Explore Projects
                    </Button>
                    <Button
                      component={Link}
                      to='/timeline'
                      variant="outlined"
                      size="large"
                      startIcon={<TimelineIcon />}
                      sx={{
                        borderColor: 'rgba(255,255,255,0.3)',
                        color: '#fff',
                        textTransform: 'none',
                        fontSize: '1.1rem',
                        py: 2,
                        px: 4,
                        borderRadius: '12px',
                        '&:hover': {
                          borderColor: 'rgba(255,255,255,0.5)',
                          backgroundColor: 'rgba(255,255,255,0.05)'
                        }
                      }}
                    >
                      View Timeline
                    </Button>
                  </Stack>


                  <Box 
                    sx={{ 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center', 
                      mb: 4 
                    }}
                  >
                    <Stack direction="row" spacing={4} flexWrap="wrap">
                      {stats.map((stat, index) => (
                        <motion.div
                          key={index}
                          variants={fadeInUp}
                          initial="hidden"
                          animate="visible"
                          custom={index + 1}
                        >
                          <Box
                            sx={{
                              width: 120,
                              height: 120,
                              background: 'linear-gradient(135deg, rgba(96,165,250,0.15) 0%, rgba(255,255,255,0.07) 100%)',
                              borderRadius: '16px',
                              border: '2px solid rgba(96,165,250,0.25)',
                              boxShadow: '0 8px 32px rgba(96,165,250,0.12)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 1,
                              textAlign: 'center',
                              transition: 'all 0.3s ease',
                              position: 'relative',
                              overflow: 'hidden',
                              '&:hover': {
                                transform: 'translateY(-6px) scale(1.05)',
                                boxShadow: '0 16px 40px rgba(96,165,250,0.18)',
                                borderColor: '#60a5fa',
                              },
                              '&:before': {
                                content: '""',
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                background: 'radial-gradient(circle at 70% 30%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 70%)',
                                zIndex: 0,
                              }
                            }}
                          >
                            <Box sx={{ color: '#60a5fa', fontSize: '2.2rem', mb: 1, zIndex: 1 }}>
                              {stat.icon}
                            </Box>
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#fff', lineHeight: 1, zIndex: 1 }}>
                              {stat.number}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 1, zIndex: 1 }}>
                              {stat.label}
                            </Typography>
                          </Box>
                        </motion.div>
                      ))}
                    </Stack>
                  </Box>
                </motion.div>
              </Grid>
            </Grid>

            {/* About GSOC Card - Centered */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
              <Box sx={{ maxWidth: '450px', width: '100%' }}>
                <motion.div
                  variants={fadeInUp}
                  initial="hidden"
                  animate="visible"
                  custom={2}
                >
                  <Card
                    elevation={0}
                    sx={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
                      backdropFilter: 'blur(30px)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '24px',
                      color: '#fff',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <CardContent sx={{ p: 4 }}>
                      {/* Program Badge */}
                      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                        <Chip
                          label="GSOC 2026"
                          sx={{
                            bgcolor: 'rgba(96, 165, 250, 0.15)',
                            color: '#60a5fa',
                            border: '1px solid rgba(96, 165, 250, 0.25)',
                            fontWeight: 600,
                            fontSize: '0.9rem'
                          }}
                        />
                      </Box>

                      {/* About GSOC */}
                      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, color: '#fff', textAlign: 'center' }}>
                        About Google Summer of Code
                      </Typography>

                      <Typography 
                        variant="body1" 
                        sx={{ 
                          color: 'rgba(255,255,255,0.8)', 
                          lineHeight: 1.6,
                          mb: 4,
                          textAlign: 'center'
                        }}
                      >
                        Google Summer of Code connects students with open source projects, 
                        providing mentorship and stipends to contribute to innovative AI solutions.
                      </Typography>

                      {/* Key Highlight */}
                      <Box sx={{ 
                        p: 3, 
                        borderRadius: '16px', 
                        bgcolor: 'rgba(96, 165, 250, 0.08)', 
                        border: '1px solid rgba(96, 165, 250, 0.15)',
                        mb: 4,
                        textAlign: 'center'
                      }}>
                        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                          Join a global community of developers working on cutting-edge AI projects
                        </Typography>
                      </Box>

                      <Divider sx={{ mb: 4, borderColor: 'rgba(255,255,255,0.1)' }} />

                      {/* Navigation Icons with Tooltips - 2x2 Grid */}
                      <Grid container spacing={2} justifyContent="center">
                        {navigationItems.map((item, index) => (
                          <Grid item xs={6} key={index} sx={{ display: 'flex', justifyContent: 'center' }}>
                            <motion.div
                              variants={fadeInUp}
                              initial="hidden"
                              animate="visible"
                              custom={index + 3}
                            >
                              <Tooltip title={item.tooltip} placement="top" arrow>
                                <IconButton
                                  component={Link}
                                  to={item.path}
                                  sx={{
                                    width: 70,
                                    height: 70,
                                    background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    borderRadius: '16px',
                                    color: '#60a5fa',
                                    fontSize: '2rem',
                                    transition: 'all 0.3s ease',
                                    '&:hover': {
                                      transform: 'translateY(-4px) scale(1.1)',
                                      borderColor: '#60a5fa',
                                      backgroundColor: 'rgba(96, 165, 250, 0.15)',
                                      boxShadow: '0 8px 32px rgba(96, 165, 250, 0.25)'
                                    }
                                  }}
                                >
                                  {item.icon}
                                </IconButton>
                              </Tooltip>
                            </motion.div>
                          </Grid>
                        ))}
                      </Grid>
                    </CardContent>
                  </Card>
                </motion.div>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Quick Navigation Section */}
        <Box sx={{ 
          py: 6, 
          px: { xs: 2, md: 4 },
          borderTop: '1px solid rgba(255,255,255,0.1)'
        }}>
          <Box sx={{ maxWidth: '1200px', margin: '0 auto' }}>
            <Typography 
              variant="h4" 
              sx={{ 
                textAlign: 'center', 
                mb: 4, 
                fontWeight: 700, 
                color: '#fff' 
              }}
            >
              Get Started Today
            </Typography>
            
            <Grid container spacing={4} justifyContent="center">
              {[
                { title: 'View Projects', desc: 'Explore our cutting-edge AI projects', path: '/projects', icon: <Code /> },
                { title: 'Program Timeline', desc: 'Check important dates and deadlines', path: '/timeline', icon: <TimelineIcon /> },
                { title: 'Meet Mentors', desc: 'Learn from industry experts', path: '/mentors', icon: <School /> }
              ].map((item, index) => (
                <Grid item xs={12} sm={4} key={index}>
                  <motion.div
                    variants={fadeInUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    custom={index}
                  >
                    <Card
                      component={Link}
                      to={item.path}
                      elevation={0}
                      sx={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '16px',
                        color: '#fff',
                        textDecoration: 'none',
                        transition: 'all 0.3s ease',
                        cursor: 'pointer',
                        '&:hover': {
                          transform: 'translateY(-8px)',
                          borderColor: 'rgba(255,255,255,0.3)',
                          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.4)'
                        }
                      }}
                    >
                      <CardContent sx={{ p: 3, textAlign: 'center' }}>
                        <Box sx={{ color: '#60a5fa', mb: 2, fontSize: '2rem' }}>
                          {item.icon}
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                          {item.title}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                          {item.desc}
                        </Typography>
                      </CardContent>
                    </Card>
                  </motion.div>
                </Grid>
              ))}
            </Grid>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default HomePage;
