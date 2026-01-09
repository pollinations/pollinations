import React, { useState } from 'react';
import mentors from '../data/mentors.json';
import { Card, CardContent, Typography, Grid, Chip, Box, Collapse, IconButton, Avatar } from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';

const MentorsPage = () => {
  const [expanded, setExpanded] = useState(null);

  const handleExpandClick = (index) => {
    setExpanded(expanded === index ? null : index);
  };

  return (
    document.title = "Mentors - gsoc.pollinations",
    <Box sx={{ padding: '4rem 0' }}>
      <Typography variant='h2' align='center' gutterBottom sx={{ marginBottom: '3rem' }}>
        Mentors
      </Typography>
      <Grid container spacing={4} sx={{ padding: '0 2rem' }}>
        {mentors.map((mentor, index) => (
          <Grid item xs={12} md={6} lg={4} key={index}>
            <Card className='glass-card'>
              <CardContent>
                <Avatar
                  alt={mentor.name}
                  src={mentor.imageUrl}
                  sx={{ width: 80, height: 80, margin: '0 auto 1rem' }}
                />
                <Typography variant='h5' component='div' sx={{ marginBottom: '0.75rem', textAlign: 'center' }}>
                  {mentor.name}
                </Typography>
                <Typography sx={{ marginBottom: '1.5rem', textAlign: 'center', color: 'text.secondary' }}>
                  {mentor.bio}
                </Typography>
                <Box sx={{ textAlign: 'center' }}>
                  {mentor.expertise.map((skill, i) => (
                    <Chip
                      label={skill}
                      key={i}
                      sx={{
                        margin: '0.25rem',
                        background: 'rgba( 255, 255, 255, 0.4 )',
                        color: '#fff',
                        border: '1px solid rgba( 255, 255, 255, 0.2 )'
                      }}
                    />
                  ))}
                </Box>
                <IconButton
                  onClick={() => handleExpandClick(index)}
                  aria-expanded={expanded === index}
                  aria-label='show more'
                  sx={{ display: 'block', margin: '1rem auto 0', transform: expanded === index ? 'rotate(180deg)' : 'rotate(0deg)', color: '#fff' }}
                >
                  <ExpandMoreIcon />
                </IconButton>
              </CardContent>
              <Collapse in={expanded === index} timeout='auto' unmountOnExit>
                <CardContent>
                  <Typography paragraph>More details about the mentor:</Typography>
                  <Typography paragraph>{mentor.longDescription}</Typography>
                </CardContent>
              </Collapse>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default MentorsPage;
