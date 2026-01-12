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
  Info,
  Star
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
    { number: "2K+", label: "GitHub Stars", icon: <Star /> },
    { number: "150+", label: "Contributors", icon: <Group /> },
    { number: "1st", label: "Year in GSOC", icon: <EmojiEvents /> },
    { number: "12", label: "Week Program", icon: <TimelineIcon /> }
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
        overflow: 'hidden',
        '@keyframes pulse': {
          '0%, 100%': { opacity: 0.4 },
          '50%': { opacity: 0.8 }
        },
        '@keyframes fadeInOut': {
          '0%, 100%': { opacity: 0.1 },
          '50%': { opacity: 0.6 }
        }
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
                    justifyContent: 'center'
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

                  {/* Main Heading with Decorative Elements */}
                  <Box sx={{ position: 'relative', mb: 4, textAlign: 'center' }}>
                    {/* Decorative Element - Left */}
                    <Box
                      sx={{
                        position: 'absolute',
                        left: { xs: '10%', md: '15%' },
                        top: '20%',
                        width: '3px',
                        height: '60%',
                        background: 'linear-gradient(180deg, transparent, #60a5fa, transparent)',
                        borderRadius: '2px',
                        opacity: 0.6
                      }}
                    />
                    
                    {/* Main Title */}
                    <Typography 
                      variant='h1' 
                      sx={{ 
                        fontWeight: 800,
                        letterSpacing: '-0.03em',
                        background: 'linear-gradient(135deg, #ffffff 0%, #60a5fa 30%, #e0e7ff 60%, #a1a1aa 100%)',
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        color: 'transparent',
                        WebkitTextFillColor: 'transparent',
                        fontSize: { xs: '2.8rem', md: '3.8rem', lg: '4.5rem' },
                        lineHeight: 1.05,
                        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
                        position: 'relative',
                        textAlign: 'center',
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          top: 0,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: '80%',
                          height: '100%',
                          background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, transparent 50%)',
                          borderRadius: '8px',
                          zIndex: -1,
                          transform: 'translateX(-50%) skewY(-1deg)'
                        }
                      }}
                    >
                      Build the Future of{' '}
                      <Box component="span" sx={{ 
                        position: 'relative',
                        background: 'linear-gradient(135deg, #ffffff 0%, #60a5fa 50%, #e0e7ff 100%)',
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        color: 'transparent',
                        WebkitTextFillColor: 'transparent',
                        '&::after': {
                          content: '""',
                          position: 'absolute',
                          bottom: '-4px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: '100%',
                          height: '3px',
                          background: 'linear-gradient(90deg, transparent, #60a5fa, transparent)',
                          borderRadius: '2px',
                          opacity: 0.8
                        }
                      }}>
                        AI
                      </Box>{' '}
                      with Open Source
                    </Typography>

                    {/* Decorative Accent */}
                    <Box
                      sx={{
                        position: 'absolute',
                        right: { xs: '10%', md: '15%' },
                        top: '10%',
                        width: '20px',
                        height: '20px',
                        background: 'radial-gradient(circle, #60a5fa 0%, transparent 70%)',
                        borderRadius: '50%',
                        opacity: 0.4,
                        animation: 'pulse 2s infinite'
                      }}
                    />
                  </Box>

                  {/* Enhanced Subtitle */}
                  <Box sx={{ position: 'relative', mb: 4, textAlign: 'center' }}>
                    <Typography 
                      variant='h5' 
                      sx={{ 
                        color: 'rgba(255,255,255,0.9)',
                        fontWeight: 400,
                        lineHeight: 1.5,
                        maxWidth: '650px',
                        fontSize: { xs: '1.3rem', md: '1.5rem', lg: '1.6rem' },
                        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
                        position: 'relative',
                        textAlign: 'center',
                        margin: '0 auto',
                        '&::before': {
                          content: '"⚡"',
                          position: 'absolute',
                          left: '-30px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: '1.2rem',
                          opacity: 0.6
                        }
                      }}
                    >
                      Join{' '}
                      <Box component="span" sx={{ 
                        fontWeight: 600, 
                        color: '#60a5fa',
                        textShadow: '0 0 10px rgba(96, 165, 250, 0.3)'
                      }}>
                        Google Summer of Code 2026
                      </Box>{' '}
                      and contribute to cutting-edge AI projects that democratize artificial intelligence for everyone.
                    </Typography>

                    {/* Floating dots decoration */}
                    <Box
                      sx={{
                        position: 'absolute',
                        right: '-40px',
                        top: '20%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        opacity: 0.3
                      }}
                    >
                      {[1, 2, 3].map((dot) => (
                        <Box
                          key={dot}
                          sx={{
                            width: '4px',
                            height: '4px',
                            borderRadius: '50%',
                            bgcolor: '#60a5fa',
                            animation: `fadeInOut 3s infinite ${dot * 0.5}s`
                          }}
                        />
                      ))}
                    </Box>
                  </Box>

                  {/* CTA Buttons */}
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 6 }}>
                    <Stack 
                      direction={{ xs: 'column', sm: 'row' }} 
                      spacing={3}
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
                  </Box>

                  {/* Stats Section */}
                  <Box 
                    sx={{ 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center', 
                      mb: 4 
                    }}
                  >
                    <Grid container spacing={3} justifyContent="center" sx={{ maxWidth: '600px' }}>
                      {stats.map((stat, index) => (
                        <Grid item xs={6} sm={3} key={index}>
                          <motion.div
                            variants={fadeInUp}
                            initial="hidden"
                            animate="visible"
                            custom={index + 1}
                          >
                            <Box
                              sx={{
                                height: '120px',
                                width: '120px',
                                background: 'linear-gradient(145deg, rgba(18, 18, 27, 0.9), rgba(27, 27, 38, 0.6))',
                                borderRadius: '20px',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 1.5,
                                textAlign: 'center',
                                position: 'relative',
                                overflow: 'hidden',
                                boxShadow: `
                                  inset 0 1px 0 rgba(255, 255, 255, 0.05),
                                  inset 0 -1px 0 rgba(0, 0, 0, 0.2),
                                  0 4px 20px rgba(0, 0, 0, 0.15)
                                `,
                                userSelect: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': {
                                  transform: 'translateY(-2px)',
                                  boxShadow: `
                                    inset 0 1px 0 rgba(255, 255, 255, 0.08),
                                    inset 0 -1px 0 rgba(0, 0, 0, 0.3),
                                    0 8px 30px rgba(0, 0, 0, 0.2),
                                    0 0 0 1px rgba(96, 165, 250, 0.1)
                                  `,
                                  '& .stat-icon': {
                                    color: '#60a5fa',
                                    transform: 'scale(1.1)'
                                  }
                                },
                                '&:before': {
                                  content: '""',
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  height: '1px',
                                  background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
                                },
                                '&:after': {
                                  content: '""',
                                  position: 'absolute',
                                  top: '50%',
                                  left: '50%',
                                  width: '60px',
                                  height: '60px',
                                  transform: 'translate(-50%, -50%)',
                                  background: 'radial-gradient(circle, rgba(96, 165, 250, 0.03) 0%, transparent 70%)',
                                  borderRadius: '50%',
                                  zIndex: 0
                                }
                              }}
                            >
                              <Box 
                                className="stat-icon"
                                sx={{ 
                                  color: 'rgba(255, 255, 255, 0.7)', 
                                  fontSize: '1.8rem',
                                  transition: 'all 0.3s ease',
                                  zIndex: 1,
                                  filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))'
                                }}
                              >
                                {stat.icon}
                              </Box>
                              <Typography 
                                variant="h5" 
                                sx={{ 
                                  fontWeight: 700, 
                                  color: '#fff', 
                                  lineHeight: 1, 
                                  zIndex: 1,
                                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                                  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif'
                                }}
                              >
                                {stat.number}
                              </Typography>
                              <Typography 
                                variant="caption" 
                                sx={{ 
                                  color: 'rgba(255, 255, 255, 0.6)', 
                                  textTransform: 'uppercase', 
                                  fontWeight: 500, 
                                  letterSpacing: 0.5, 
                                  zIndex: 1,
                                  fontSize: '0.75rem',
                                  lineHeight: 1.2,
                                  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif'
                                }}
                              >
                                {stat.label}
                              </Typography>
                            </Box>
                          </motion.div>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                </motion.div>
              </Grid>
            </Grid>

            {/* About GSOC Card - Centered with Side Decorations */}
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              position: 'relative',
              mt: 8,
              px: { xs: 2, md: 4 }
            }}>
              {/* Left Decorative Elements */}
              <Box sx={{ 
                position: 'absolute',
                left: { xs: 10, md: 50, lg: 150 },
                top: '20%',
                display: { xs: 'none', md: 'block' },
                zIndex: 0
              }}>
                {/* Geometric shapes */}
                <Box sx={{
                  position: 'relative',
                  width: '80px',
                  height: '80px'
                }}>
                  <Box sx={{
                    position: 'absolute',
                    width: '30px',
                    height: '30px',
                    border: '2px solid rgba(96, 165, 250, 0.3)',
                    borderRadius: '4px',
                    top: 0,
                    left: 0,
                    animation: 'pulse 3s infinite'
                  }} />
                  <Box sx={{
                    position: 'absolute',
                    width: '20px',
                    height: '20px',
                    bgcolor: 'rgba(96, 165, 250, 0.2)',
                    borderRadius: '50%',
                    top: '40px',
                    left: '50px',
                    animation: 'fadeInOut 4s infinite 1s'
                  }} />
                  <Box sx={{
                    position: 'absolute',
                    width: '40px',
                    height: '2px',
                    bgcolor: 'rgba(96, 165, 250, 0.4)',
                    top: '70px',
                    left: '10px',
                    borderRadius: '1px'
                  }} />
                </Box>
                
                {/* Code-like lines */}
                <Box sx={{ mt: 4, opacity: 0.3 }}>
                  {[60, 40, 35, 50].map((width, index) => (
                    <Box
                      key={index}
                      sx={{
                        width: `${width}px`,
                        height: '2px',
                        bgcolor: '#60a5fa',
                        mb: '6px',
                        borderRadius: '1px',
                        animation: `fadeInOut 2s infinite ${index * 0.3}s`
                      }}
                    />
                  ))}
                </Box>
              </Box>

              {/* Right Decorative Elements */}
              <Box sx={{ 
                position: 'absolute',
                right: { xs: 10, md: 50, lg: 150 },
                top: '30%',
                display: { xs: 'none', md: 'block' },
                zIndex: 0
              }}>
                {/* Circuit-like pattern */}
                <Box sx={{ position: 'relative', width: '70px', height: '70px' }}>
                  <Box sx={{
                    position: 'absolute',
                    width: '8px',
                    height: '8px',
                    border: '2px solid rgba(96, 165, 250, 0.4)',
                    borderRadius: '50%',
                    top: 0,
                    left: 0
                  }} />
                  <Box sx={{
                    position: 'absolute',
                    width: '30px',
                    height: '2px',
                    bgcolor: 'rgba(96, 165, 250, 0.4)',
                    top: '4px',
                    left: '12px',
                    borderRadius: '1px'
                  }} />
                  <Box sx={{
                    position: 'absolute',
                    width: '2px',
                    height: '20px',
                    bgcolor: 'rgba(96, 165, 250, 0.4)',
                    top: '15px',
                    left: '40px',
                    borderRadius: '1px'
                  }} />
                  <Box sx={{
                    position: 'absolute',
                    width: '15px',
                    height: '15px',
                    border: '2px solid rgba(96, 165, 250, 0.3)',
                    top: '50px',
                    left: '30px',
                    transform: 'rotate(45deg)',
                    animation: 'pulse 2s infinite 0.5s'
                  }} />
                </Box>

                {/* Floating particles */}
                <Box sx={{ mt: 3 }}>
                  {[1, 2, 3, 4, 5].map((particle) => (
                    <Box
                      key={particle}
                      sx={{
                        position: 'absolute',
                        width: '3px',
                        height: '3px',
                        borderRadius: '50%',
                        bgcolor: 'rgba(96, 165, 250, 0.4)',
                        left: `${Math.random() * 60}px`,
                        top: `${Math.random() * 60}px`,
                        animation: `fadeInOut 3s infinite ${particle * 0.6}s`
                      }}
                    />
                  ))}
                </Box>
              </Box>

              {/* Main Card */}
              <Box sx={{ maxWidth: '450px', width: '100%', position: 'relative', zIndex: 2 }}>
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
