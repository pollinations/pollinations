import React, { useState, useEffect } from 'react';
import faqData from '../info/faq.json';
import { 
  Box, 
  Typography, 
  Accordion, 
  AccordionSummary, 
  AccordionDetails, 
  Container, 
  Chip,
  TextField,
  InputAdornment,
  Stack,
  Card,
  CardContent,
  Grid
} from '@mui/material';
import { 
  ExpandMore, 
  Search, 
  HelpOutline, 
  QuestionAnswer,
  Lightbulb,
  Group,
  School,
  Code,
  Timeline as TimelineIcon,
  Support
} from '@mui/icons-material';
import { motion } from 'framer-motion';

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

const FAQPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [expandedAccordion, setExpandedAccordion] = useState(false);

  useEffect(() => {
    document.title = "Frequently Asked Questions - GSOC 2026 | pollinations.ai";
  }, []);

  // Get unique categories
  const categories = ['All', ...new Set(faqData.map(faq => faq.category))];

  // Filter FAQs based on search and category
  const filteredFAQs = faqData.filter(faq => {
    const matchesSearch = faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         faq.answer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Category icons mapping
  const categoryIcons = {
    'General': <HelpOutline />,
    'Application': <QuestionAnswer />,
    'Projects': <Code />,
    'Timeline': <TimelineIcon />,
    'Mentorship': <School />,
    'Technical': <Lightbulb />,
    'Community': <Group />,
    'Contribution': <Code />,
    'Selection': <QuestionAnswer />,
    'Support': <Support />,
    'Post-GSOC': <School />,
    'Troubleshooting': <Support />
  };

  // Category colors mapping
  const categoryColors = {
    'General': { bg: 'rgba(96, 165, 250, 0.1)', border: 'rgba(96, 165, 250, 0.3)', color: '#60a5fa' },
    'Application': { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', color: '#22c55e' },
    'Projects': { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b' },
    'Timeline': { bg: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.3)', color: '#8b5cf6' },
    'Mentorship': { bg: 'rgba(236, 72, 153, 0.1)', border: 'rgba(236, 72, 153, 0.3)', color: '#ec4899' },
    'Technical': { bg: 'rgba(6, 182, 212, 0.1)', border: 'rgba(6, 182, 212, 0.3)', color: '#06b6d4' },
    'Community': { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', color: '#10b981' },
    'Contribution': { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b' },
    'Selection': { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', color: '#22c55e' },
    'Support': { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', color: '#ef4444' },
    'Post-GSOC': { bg: 'rgba(236, 72, 153, 0.1)', border: 'rgba(236, 72, 153, 0.3)', color: '#ec4899' },
    'Troubleshooting': { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', color: '#ef4444' }
  };

  const handleAccordionChange = (panel) => (event, isExpanded) => {
    setExpandedAccordion(isExpanded ? panel : false);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#09090b', position: 'relative', overflow: 'hidden' }}>
      <Box 
        sx={{
          position: 'absolute',
          top: '-10%',
          right: '-10%',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(96, 165, 250, 0.08) 0%, rgba(0,0,0,0) 70%)',
          zIndex: 0,
          pointerEvents: 'none'
        }} 
      />
      <Box 
        sx={{
          position: 'absolute',
          bottom: '-10%',
          left: '-10%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.06) 0%, rgba(0,0,0,0) 70%)',
          zIndex: 0,
          pointerEvents: 'none'
        }} 
      />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1, py: 8 }}>
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          custom={0}
        >
          <Box sx={{ textAlign: 'center', mb: 8 }}>
            <Typography 
              variant='h2' 
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
              Frequently Asked Questions
            </Typography>
            
            <Typography 
              variant='h6' 
              sx={{ 
                color: 'rgba(255,255,255,0.7)', 
                fontWeight: 400, 
                maxWidth: '800px', 
                margin: '0 auto', 
                lineHeight: 1.6,
                mb: 4
              }}
            >
              Everything you need to know about participating in Google Summer of Code 2026 with pollinations.ai
            </Typography>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} sx={{ justifyContent: 'center', alignItems: 'center', mb: 6 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>{faqData.length}</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Questions</Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>{categories.length - 1}</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Categories</Typography>
              </Box>
            </Stack>
          </Box>
        </motion.div>

        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          custom={1}
        >
          <Card 
            elevation={0}
            sx={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '20px',
              mb: 6
            }}
          >
            <CardContent sx={{ p: 2 }}>
              <Grid container spacing={4} alignItems="center">
                <Grid item xs={15} md={6}>
                  <TextField
                    fullWidth
                    variant="outlined"
                    placeholder="Search questions or answers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search sx={{ color: 'rgba(255,255,255,0.5)', borderRadius: '25px' }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#fff',
                        bgcolor: 'rgba(255,255,255,0.05)',
                        '& fieldset': {
                          borderColor: 'rgba(255,255,255,0.2)',
                        },
                        '&:hover fieldset': {
                          borderColor: 'rgba(255,255,255,0.3)',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#60a5fa',
                        },
                      },
                      '& .MuiInputBase-input::placeholder': {
                        color: 'rgba(255,255,255,0.5)',
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {categories.map((category) => (
                      <Chip
                        key={category}
                        label={category}
                        onClick={() => setSelectedCategory(category)}
                        icon={category !== 'All' ? categoryIcons[category] : undefined}
                        sx={{
                          bgcolor: selectedCategory === category 
                            ? (category === 'All' ? 'rgba(255,255,255,0.15)' : (categoryColors[category]?.bg || 'rgba(255,255,255,0.1)'))
                            : 'rgba(255,255,255,0.05)',
                          color: selectedCategory === category 
                            ? (category === 'All' ? '#fff' : (categoryColors[category]?.color || '#fff'))
                            : 'rgba(255,255,255,0.7)',
                          border: `1px solid ${selectedCategory === category 
                            ? (category === 'All' ? 'rgba(255,255,255,0.3)' : (categoryColors[category]?.border || 'rgba(255,255,255,0.2)'))
                            : 'rgba(255,255,255,0.1)'}`,
                          '&:hover': {
                            bgcolor: category === 'All' 
                              ? 'rgba(255,255,255,0.1)' 
                              : (categoryColors[category]?.bg || 'rgba(255,255,255,0.1)'),
                            borderColor: category === 'All' 
                              ? 'rgba(255,255,255,0.3)' 
                              : (categoryColors[category]?.border || 'rgba(255,255,255,0.2)'),
                          },
                          mb: 1
                        }}
                      />
                    ))}
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </motion.div>

        {/* FAQ Accordions */}
        <Box sx={{ mb: 8 }}>
          {filteredFAQs.length === 0 ? (
            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              custom={2}
            >
              <Card 
                elevation={0}
                sx={{
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '16px',
                  textAlign: 'center',
                  p: 6
                }}
              >
                <Typography variant="h6" sx={{ color: '#ef4444', mb: 2 }}>
                  No questions found
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                  Try adjusting your search terms or category filter
                </Typography>
              </Card>
            </motion.div>
          ) : (
            filteredFAQs.map((faq, index) => {
              const categoryStyle = categoryColors[faq.category] || { bg: 'rgba(255,255,255,0.1)', border: 'rgba(255,255,255,0.2)', color: '#fff' };
              
              return (
                <motion.div
                  key={faq.id}
                  variants={fadeInUp}
                  initial="hidden"
                  animate="visible"
                  custom={index + 2}
                >
                  <Accordion
                    expanded={expandedAccordion === `panel${faq.id}`}
                    onChange={handleAccordionChange(`panel${faq.id}`)}
                    elevation={0}
                    sx={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '16px !important',
                      mb: 2,
                      color: '#fff',
                      '&:hover': {
                        borderColor: 'rgba(255,255,255,0.2)',
                        transform: 'translateY(-2px)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
                      },
                      '&.Mui-expanded': {
                        border: `3px solid ${categoryStyle.bg}`,
                        borderColor: `${categoryStyle.bg}`,
                        boxShadow: `0 8px 32px ${categoryStyle.bg}`,
                        marginBottom: '16px !important'
                      },
                      '&:before': {
                        display: 'none',
                      },
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMore sx={{ color: 'rgba(255,255,255,0.7)' }} />}
                      sx={{
                        px: 3,
                        py: 2,
                        '& .MuiAccordionSummary-content': {
                          alignItems: 'center',
                          gap: 2
                        }
                      }}
                    >
                      <Chip
                        label={faq.category}
                        size="small"
                        icon={categoryIcons[faq.category]}
                        sx={{
                          bgcolor: categoryStyle.bg,
                          color: categoryStyle.color,
                          border: `1px solid ${categoryStyle.border}`,
                          fontSize: '0.75rem',
                          height: '24px'
                        }}
                      />
                      <Typography 
                        variant="h6" 
                        sx={{ 
                          fontWeight: 600, 
                          flex: 1,
                          fontSize: { xs: '1rem', md: '1.1rem' }
                        }}
                      >
                        {faq.question}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 3, pb: 3 }}>
                      <Typography 
                        variant="body1" 
                        sx={{ 
                          color: 'rgba(255,255,255,0.8)', 
                          lineHeight: 1.7,
                          fontSize: '1rem',
                          whiteSpace: 'pre-line'
                        }}
                      >
                        {faq.answer}
                      </Typography>
                    </AccordionDetails>
                  </Accordion>
                </motion.div>
              );
            })
          )}
        </Box>

        {/* Contact Section */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          custom={filteredFAQs.length + 3}
        >
          <Card 
            elevation={0}
            sx={{
              background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, rgba(96, 165, 250, 0.05) 100%)',
              border: '1px solid rgba(96, 165, 250, 0.2)',
              borderRadius: '20px',
              textAlign: 'center',
              p: 6
            }}
          >
            <Typography variant="h5" sx={{ color: '#60a5fa', fontWeight: 600, mb: 2 }}>
              Still have questions?
            </Typography>
            <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)', mb: 4, maxWidth: '600px', mx: 'auto' }}>
              Can't find what you're looking for? Our community and mentors are here to help. 
              Join our Discord, check out our documentation, or reach out directly.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
              <Chip
                label="Join Discord Community"
                onClick={() => window.open('https://discord.gg/pollinations', '_blank')}
                sx={{
                  bgcolor: 'rgba(96, 165, 250, 0.15)',
                  color: '#60a5fa',
                  border: '1px solid rgba(96, 165, 250, 0.3)',
                  px: 3,
                  py: 2,
                  fontSize: '0.9rem',
                  '&:hover': {
                    bgcolor: 'rgba(96, 165, 250, 0.25)',
                    cursor: 'pointer'
                  }
                }}
              />
              <Chip
                label="Read Documentation"
                onClick={() => window.open('/CONTRIBUTING.md', '_blank')}
                sx={{
                  bgcolor: 'rgba(34, 197, 94, 0.15)',
                  color: '#22c55e',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  px: 3,
                  py: 2,
                  fontSize: '0.9rem',
                  '&:hover': {
                    bgcolor: 'rgba(34, 197, 94, 0.25)',
                    cursor: 'pointer'
                  }
                }}
              />
            </Stack>
          </Card>
        </motion.div>
      </Container>
    </Box>
  );
};

export default FAQPage;
