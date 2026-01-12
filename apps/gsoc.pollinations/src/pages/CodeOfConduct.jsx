import React, { useEffect } from 'react';
import { 
  Box, 
  Container, 
  Typography, 
  Paper,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from '@mui/material';
import { motion } from 'framer-motion';
import { Shield, Email, Warning, Gavel } from '@mui/icons-material';

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

const CodeOfConductPage = () => {
  useEffect(() => {
    document.title = "Code of Conduct - GSOC 2026 × pollinations.ai";
  }, []);

  const sections = [
    {
      title: "Our Pledge",
      content: "We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone, regardless of age, body size, visible or invisible disability, ethnicity, sex characteristics, gender identity and expression, level of experience, education, socio-economic status, nationality, personal appearance, race, religion, or sexual identity and orientation."
    },
    {
      title: "Our Standards",
      positiveExamples: [
        "Demonstrating empathy and kindness toward other people",
        "Being respectful of differing opinions, viewpoints, and experiences",
        "Giving and gracefully accepting constructive feedback",
        "Accepting responsibility and apologizing to those affected by our mistakes",
        "Focusing on what is best not just for us as individuals, but for the overall community"
      ],
      negativeExamples: [
        "The use of sexualized language or imagery, and sexual attention or advances of any kind",
        "Trolling, insulting or derogatory comments, and personal or political attacks",
        "Public or private harassment",
        "Publishing others' private information without explicit permission",
        "Other conduct which could reasonably be considered inappropriate in a professional setting"
      ]
    },
    {
      title: "Enforcement Guidelines",
      guidelines: [
        {
          level: "1. Correction",
          impact: "Use of inappropriate language or other behavior deemed unprofessional or unwelcome in the community.",
          consequence: "A private, written warning from community leaders, providing clarity around the nature of the violation and an explanation of why the behavior was inappropriate. A public apology may be requested."
        },
        {
          level: "2. Warning", 
          impact: "A violation through a single incident or series of actions.",
          consequence: "A warning with consequences for continued behavior. No interaction with the people involved, including unsolicited interaction with those enforcing the Code of Conduct, for a specified period of time."
        },
        {
          level: "3. Temporary Ban",
          impact: "A serious violation of community standards, including sustained inappropriate behavior.",
          consequence: "A temporary ban from any sort of interaction or public communication with the community for a specified period of time."
        },
        {
          level: "4. Permanent Ban",
          impact: "Demonstrating a pattern of violation of community standards, including sustained inappropriate behavior, harassment of an individual, or aggression toward or disparagement of classes of individuals.",
          consequence: "A permanent ban from any sort of public interaction within the community."
        }
      ]
    }
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#09090b', py: 8 }}>
      <Container maxWidth="lg">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          custom={0}
        >
          {/* Header */}
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: '16px',
                  bgcolor: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)'
                }}
              >
                <Shield sx={{ fontSize: '3rem', color: '#22c55e' }} />
              </Box>
            </Box>
            
            <Typography
              variant="h2"
              sx={{
                fontWeight: 700,
                background: 'linear-gradient(135deg, #fff 0%, #22c55e 50%, #a1a1aa 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                mb: 2
              }}
            >
              Contributor Covenant Code of Conduct
            </Typography>
            
            <Typography
              variant="h6"
              sx={{ color: 'rgba(255,255,255,0.8)', maxWidth: '800px', mx: 'auto' }}
            >
              Our commitment to fostering an open, welcoming, diverse, inclusive, and healthy community
            </Typography>
          </Box>
        </motion.div>

        {/* Our Pledge Section */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          custom={1}
        >
          <Paper
            elevation={0}
            sx={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '16px',
              p: 4,
              mb: 4
            }}
          >
            <Typography variant="h4" sx={{ color: '#fff', fontWeight: 600, mb: 3 }}>
              Our Pledge
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: 'rgba(255,255,255,0.9)', lineHeight: 1.7 }}
            >
              {sections[0].content}
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: 'rgba(255,255,255,0.9)', lineHeight: 1.7, mt: 2 }}
            >
              We pledge to act and interact in ways that contribute to an open, welcoming, diverse, inclusive, and healthy community.
            </Typography>
          </Paper>
        </motion.div>

        {/* Our Standards Section */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          custom={2}
        >
          <Paper
            elevation={0}
            sx={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '16px',
              p: 4,
              mb: 4
            }}
          >
            <Typography variant="h4" sx={{ color: '#fff', fontWeight: 600, mb: 3 }}>
              Our Standards
            </Typography>
            
            <Typography variant="h6" sx={{ color: '#22c55e', fontWeight: 600, mb: 2 }}>
              Examples of behavior that contributes to a positive environment:
            </Typography>
            <List>
              {sections[1].positiveExamples.map((example, index) => (
                <ListItem key={index} sx={{ py: 0.5 }}>
                  <ListItemIcon>
                    <Box sx={{ color: '#22c55e', fontSize: '1.2rem' }}>•</Box>
                  </ListItemIcon>
                  <ListItemText
                    primary={example}
                    sx={{ '& .MuiListItemText-primary': { color: 'rgba(255,255,255,0.9)' } }}
                  />
                </ListItem>
              ))}
            </List>

            <Typography variant="h6" sx={{ color: '#ef4444', fontWeight: 600, mb: 2, mt: 3 }}>
              Examples of unacceptable behavior:
            </Typography>
            <List>
              {sections[1].negativeExamples.map((example, index) => (
                <ListItem key={index} sx={{ py: 0.5 }}>
                  <ListItemIcon>
                    <Box sx={{ color: '#ef4444', fontSize: '1.2rem' }}>•</Box>
                  </ListItemIcon>
                  <ListItemText
                    primary={example}
                    sx={{ '& .MuiListItemText-primary': { color: 'rgba(255,255,255,0.9)' } }}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </motion.div>

        {/* Enforcement Section */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          custom={3}
        >
          <Paper
            elevation={0}
            sx={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '16px',
              p: 4,
              mb: 4
            }}
          >
            <Typography variant="h4" sx={{ color: '#fff', fontWeight: 600, mb: 3 }}>
              Enforcement Responsibilities
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: 'rgba(255,255,255,0.9)', lineHeight: 1.7, mb: 3 }}
            >
              Community leaders are responsible for clarifying and enforcing our standards of acceptable behavior and will take appropriate and fair corrective action in response to any behavior that they deem inappropriate, threatening, offensive, or harmful.
            </Typography>

            <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600, mb: 3 }}>
              Enforcement Guidelines
            </Typography>
            
            {sections[2].guidelines.map((guideline, index) => (
              <Box key={index} sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ color: '#60a5fa', fontWeight: 600, mb: 1 }}>
                  {guideline.level}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: 'rgba(255,255,255,0.8)', mb: 1, fontWeight: 500 }}
                >
                  <strong>Community Impact:</strong> {guideline.impact}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: 'rgba(255,255,255,0.8)' }}
                >
                  <strong>Consequence:</strong> {guideline.consequence}
                </Typography>
                {index < sections[2].guidelines.length - 1 && (
                  <Divider sx={{ mt: 2, borderColor: 'rgba(255,255,255,0.1)' }} />
                )}
              </Box>
            ))}
          </Paper>
        </motion.div>

        {/* Contact Section */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          custom={4}
        >
          <Paper
            elevation={0}
            sx={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '16px',
              p: 4,
              textAlign: 'center'
            }}
          >
            <Email sx={{ fontSize: '2.5rem', color: '#60a5fa', mb: 2 }} />
            <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600, mb: 2 }}>
              Enforcement
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: 'rgba(255,255,255,0.9)', mb: 2 }}
            >
              Instances of abusive, harassing, or otherwise unacceptable behavior may be reported to the community leaders responsible for enforcement at:
            </Typography>
            <Typography
              variant="h6"
              sx={{ 
                color: '#60a5fa',
                textDecoration: 'underline',
                cursor: 'pointer'
              }}
              onClick={() => window.location.href = 'mailto:ayushman@myceli.ai'}
            >
              ayushman@myceli.ai
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255,255,255,0.7)', mt: 2 }}
            >
              All complaints will be reviewed and investigated promptly and fairly.
            </Typography>
          </Paper>
        </motion.div>
      </Container>
    </Box>
  );
};

export default CodeOfConductPage;
