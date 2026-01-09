import React, { useState } from 'react';
import projects from '../data/projects.json';
import { Card, CardContent, Typography, Grid, Chip, Box, Collapse, IconButton } from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';

const ProjectsPage = () => {
  const [expanded, setExpanded] = useState(null);

  const handleExpandClick = (index) => {
    setExpanded(expanded === index ? null : index);
  };

  return (
    <Box sx={{ padding: '4rem 0' }}>
      <Typography variant='h2' align='center' gutterBottom sx={{ marginBottom: '3rem' }}>
        Projects
      </Typography>
      <Grid container spacing={4} sx={{ padding: '0 2rem' }}>
        {projects && projects.map((project, index) => (
          <Grid item xs={12} md={6} lg={4} key={index}>
            <Card className='glass-card'>
              <CardContent>
                <Typography variant='h5' component='div' sx={{ marginBottom: '0.75rem' }}>
                  {project.title}
                </Typography>
                <Typography sx={{ marginBottom: '1.5rem', color: 'text.secondary' }}>
                  {project.description}
                </Typography>
                <Box>
                  {project.technologies.map((tag, i) => (
                    <Chip
                      label={tag}
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
                  <Typography paragraph>More details about the project:</Typography>
                  <Typography paragraph>{project.longDescription}</Typography>
                </CardContent>
              </Collapse>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default ProjectsPage;