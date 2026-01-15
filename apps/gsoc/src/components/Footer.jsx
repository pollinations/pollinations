import { Box, Typography, Grid, Link, IconButton, Chip, Divider } from '@mui/material';
import { GitHub, Twitter, LinkedIn, Reddit, Instagram } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const resourceLinks = [
    { name: 'Timeline', path: '/timeline' },
    { name: 'Projects', path: '/projects' },
    { name: 'Mentors', path: '/mentors' },
    { name: 'About', path: '/about' }
  ];

  const communityLinks = [
    { name: 'GitHub', icon: <GitHub />, url: 'https://github.com/pollinations/pollinations' },
    { name: 'Twitter', icon: <Twitter />, url: 'https://twitter.com/pollinations_ai' },
    { name: 'LinkedIn', icon: <LinkedIn/>, url: 'https://www.linkedin.com/company/pollinations-ai' },
    { name: 'Reddit', icon: <Reddit />, url: 'https://www.reddit.com/r/pollinations_ai' },

    { name: 'Instagram', icon: <Instagram />, url: 'https://www.instagram.com/pollinations_ai' }
  ];

  const legalLinks = [
    { name: 'Privacy Policy', path: '/privacy' },
    { name: 'Terms & Conditions', path: '/terms' },
    { name: 'Contributing', url: 'https://github.com/pollinations/pollinations/blob/main/CONTRIBUTING.md' },
    { name: 'Code of Conduct', url: 'https://github.com/pollinations/pollinations/blob/main/CODE_OF_CONDUCT.md' }
  ];

  return (
    <Box 
      component="footer" 
      sx={{
        background: 'linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.85) 100%)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        color: '#fff',
        mt: 8,
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '600px',
          height: '200px',
          background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0) 70%)',
          pointerEvents: 'none'
        }
      }}
    >
      <Box sx={{ maxWidth: '1200px', mx: 'auto', px: { xs: 2, md: 4 }, py: { xs: 4, md: 6 }, position: 'relative', zIndex: 1 }}>
        <Grid container spacing={{ xs: 4, md: 6 }}>
          {/* Brand Section */}
          <Grid item xs={12} md={4}>
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Typography 
                  variant="h6" 
                  sx={{ 
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #fff 0%, #a1a1aa 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    letterSpacing: '-0.02em'
                  }}
                >
                  GSOC - pollinations.ai
                </Typography>
                <Chip 
                  label="2026" 
                  size="small" 
                  sx={{ 
                    bgcolor: 'rgba(255,255,255,0.1)', 
                    color: 'rgba(255,255,255,0.8)',
                    fontSize: '12px',
                    height: '20px',
                    fontFamily: 'monospace',
                    fontWeight: 500,
                    border: '1px solid rgba(255,255,255,0.2)'
                  }} 
                />
              </Box>
              <Typography 
                variant="body2" 
                sx={{ 
                  color: 'rgba(255,255,255,0.7)', 
                  lineHeight: 1.6,
                  mb: 2
                }}
              >
                Building the future of AI and open source together through Google Summer of Code 2026.
              </Typography>

              {/* Contact Email Section */}
              <Box 
                sx={{ 
                  mb: 3,
                  p: 2,
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.02)',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2
                }}
              >
                <Typography 
                  variant="caption" 
                  sx={{ 
                    color: 'rgba(255,255,255,0.5)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontSize: '0.7rem',
                    fontWeight: 600
                  }}
                >
                  Contact Us
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    color: 'rgba(190, 157, 157, 0.8)', 
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    mt: 0.5,
                    userSelect: 'all',
                    cursor: 'pointer',
                    textTransform: 'none'
                  }}
                >
                      gsoc@pollinations.ai
                </Typography>
                
              </Box>
              
              {/* Social Icons */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                {communityLinks.map((social) => (
                  <IconButton
                    key={social.name}
                    component="a"
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      color: 'rgba(255,255,255,0.7)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      p: 1,
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        color: '#fff',
                        borderColor: 'rgba(255,255,255,0.3)',
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        transform: 'translateY(-2px)'
                      }
                    }}
                  >
                    {social.icon}
                  </IconButton>
                ))}
              </Box>
            </Box>
          </Grid>

          {/* Resources Section */}
          <Grid item xs={12} sm={6} md={2.5}>
            <Typography 
              variant="subtitle2" 
              sx={{ 
                fontWeight: 600, 
                mb: 2,
                color: '#fff',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontSize: '0.75rem'
              }}
            >
              Resources
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {resourceLinks.map((link) => (
                <Link
                  key={link.name}
                  component={RouterLink}
                  to={link.path}
                  sx={{
                    color: 'rgba(255,255,255,0.7)',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    transition: 'all 0.3s ease',
                    display: 'inline-block',
                    '&:hover': {
                      color: '#fff',
                      transform: 'translateX(4px)'
                    }
                  }}
                >
                  {link.name}
                </Link>
              ))}
            </Box>
          </Grid>

          {/* Community Section */}
          <Grid item xs={12} sm={6} md={2.5}>
            <Typography 
              variant="subtitle2" 
              sx={{ 
                fontWeight: 600, 
                mb: 2,
                color: '#fff',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontSize: '0.75rem'
              }}
            >
              Community
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {communityLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    color: 'rgba(255,255,255,0.7)',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    transition: 'all 0.3s ease',
                    display: 'inline-block',
                    '&:hover': {
                      color: '#fff',
                      transform: 'translateX(4px)'
                    }
                  }}
                >
                  {link.name}
                </Link>
              ))}
            </Box>
          </Grid>

          {/* Legal Section */}
          <Grid item xs={12} sm={12} md={3}>
            <Typography 
              variant="subtitle2" 
              sx={{ 
                fontWeight: 600, 
                mb: 2,
                color: '#fff',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontSize: '0.75rem'
              }}
            >
              Legal
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {legalLinks.map((link) => (
                <Link
                  key={link.name}
                  component={link.path ? RouterLink : 'a'}
                  to={link.path}
                  href={link.url}
                  target={link.url ? "_blank" : undefined}
                  rel={link.url ? "noopener noreferrer" : undefined}
                  sx={{
                    color: 'rgba(255,255,255,0.7)',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    transition: 'all 0.3s ease',
                    display: 'inline-block',
                    '&:hover': {
                      color: '#fff',
                      transform: 'translateX(4px)'
                    }
                  }}
                >
                  {link.name}
                </Link>
              ))}
            </Box>
          </Grid>
        </Grid>

        {/* Divider */}
        <Divider 
          sx={{ 
            my: 4, 
            borderColor: 'rgba(255,255,255,0.1)',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)'
          }} 
        />

        {/* Copyright */}
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 2
        }}>
          <Typography 
            variant="body2" 
            sx={{ 
              color: 'rgba(255,255,255,0.6)',
              fontFamily: 'monospace',
              fontSize: '0.8rem'
            }}
          >
            Copyright © {currentYear} pollinations.ai. All rights reserved.
          </Typography>
          
          <Typography 
            variant="caption" 
            sx={{ 
              color: 'rgba(255,255,255,0.4)',
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              px: 2,
              py: 0.5,
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.02)'
            }}
          >
            2026
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

