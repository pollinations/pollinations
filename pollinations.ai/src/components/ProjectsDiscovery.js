/**
 * Projects Discovery Page
 * 
 * Simple, minimal interface for exploring Pollinations.AI ecosystem projects
 * Uses existing project data structure for consistency
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Avatar,
  Tooltip
} from '@mui/material';
import {
  GitHub as GitHubIcon,
  Launch as LaunchIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Star as StarIcon,
  NewReleases as NewIcon
} from '@mui/icons-material';

import { projects, categories } from '../config/projectList.js';

const ProjectsDiscovery = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Convert projects object to flat array for easier processing
  const allProjectsArray = useMemo(() => {
    const projectsArray = [];
    Object.keys(projects).forEach(categoryKey => {
      projects[categoryKey].forEach(project => {
        projectsArray.push({
          ...project,
          category: categoryKey,
          categoryTitle: categories.find(cat => cat.key === categoryKey)?.title || categoryKey
        });
      });
    });
    return projectsArray;
  }, []);

  // Filter projects based on search and category
  const filteredProjects = useMemo(() => {
    let filtered = allProjectsArray;

    // Category filter
    if (selectedCategory) {
      filtered = filtered.filter(project => project.category === selectedCategory);
    }

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(project =>
        project.name.toLowerCase().includes(searchLower) ||
        project.description.toLowerCase().includes(searchLower) ||
        project.author?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [allProjectsArray, searchTerm, selectedCategory]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
  };

  const ProjectCard = ({ project }) => (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography 
            variant="h6" 
            component="h3" 
            sx={{ 
              flexGrow: 1, 
              fontSize: '1.1rem',
              color: 'text.primary'
            }}
          >
            {project.name}
          </Typography>
          {project.isNew && (
            <Tooltip title="New Project">
              <NewIcon color="success" fontSize="small" />
            </Tooltip>
          )}
        </Box>
        
        <Chip
          label={project.categoryTitle}
          size="small"
          variant="outlined"
          sx={{ 
            mb: 1,
            borderColor: 'primary.main',
            color: 'primary.main'
          }}
        />
        
        <Typography 
          variant="body2" 
          sx={{ 
            mb: 2,
            color: 'text.secondary'
          }}
        >
          {project.description}
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {project.author && (
            <Chip
              label={project.author}
              size="small"
              variant="outlined"
              avatar={<Avatar sx={{ width: 20, height: 20 }}>{project.author.charAt(0)}</Avatar>}
              sx={{
                borderColor: 'text.secondary',
                color: 'text.secondary'
              }}
            />
          )}
          {project.stars && (
            <Chip
              icon={<StarIcon />}
              label={project.stars}
              size="small"
              variant="outlined"
              sx={{
                borderColor: 'primary.main',
                color: 'primary.main'
              }}
            />
          )}
        </Box>
      </CardContent>
      
      <CardActions>
        <Button
          size="small"
          startIcon={<LaunchIcon />}
          href={project.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Visit
        </Button>
        {project.repo && (
          <Button
            size="small"
            startIcon={<GitHubIcon />}
            href={project.repo}
            target="_blank"
            rel="noopener noreferrer"
          >
            Code
          </Button>
        )}
      </CardActions>
    </Card>
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          Pollinations.AI Projects
        </Typography>
        <Typography variant="h6" color="text.secondary">
          Discover amazing AI-powered projects from our community
        </Typography>
      </Box>

      {/* Filters */}
      <Box sx={{ mb: 4 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} />,
                endAdornment: searchTerm && (
                  <IconButton size="small" onClick={() => setSearchTerm('')}>
                    <ClearIcon />
                  </IconButton>
                )
              }}
            />
          </Grid>
          
          <Grid item xs={12} sm={4} md={3}>
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={selectedCategory}
                label="Category"
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <MenuItem value="">All Categories</MenuItem>
                {categories.map((category) => (
                  <MenuItem key={category.key} value={category.key}>
                    {category.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} sm={2} md={2}>
            <Button 
              variant="outlined" 
              onClick={handleClearFilters}
              disabled={!searchTerm && !selectedCategory}
            >
              Clear All
            </Button>
          </Grid>

          <Grid item xs={12} md={3}>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: { xs: 'left', md: 'right' } }}>
              {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''} found
            </Typography>
          </Grid>
        </Grid>
      </Box>

      {/* Projects Grid */}
      <Grid container spacing={3}>
        {filteredProjects.map((project, index) => (
          <Grid item xs={12} sm={6} md={4} key={`${project.category}-${index}`}>
            <ProjectCard project={project} />
          </Grid>
        ))}
      </Grid>

      {/* No results */}
      {filteredProjects.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">
            No projects found matching your criteria
          </Typography>
          <Button 
            variant="outlined" 
            onClick={handleClearFilters}
            sx={{ mt: 2 }}
          >
            Clear Filters
          </Button>
        </Box>
      )}
    </Container>
  );
};

export default ProjectsDiscovery;