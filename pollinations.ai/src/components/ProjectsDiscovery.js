/**
 * Projects Discovery Page
 * 
 * Interactive page with filtering, searching, and sorting capabilities
 * for exploring the Pollinations.AI ecosystem
 */

import React, { useState, useEffect, useMemo } from 'react';
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
  OutlinedInput,
  Checkbox,
  ListItemText,
  IconButton,
  Avatar,
  Badge,
  Skeleton,
  Alert,
  Tooltip,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  AppBar
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Star as StarIcon,
  OpenInNew as OpenIcon,
  GitHub as GitHubIcon,
  NewReleases as NewIcon,
  Verified as VerifiedIcon,
  Clear as ClearIcon,
  ViewModule as GridViewIcon,
  ViewList as ListViewIcon,
  Sort as SortIcon,
  TrendingUp as TrendingIcon
} from '@mui/icons-material';
import { styled, alpha } from '@mui/material/styles';

// Import project data and utilities
import { projectsData } from '../data/projectsData.js';
import { FilterSchema } from '../config/schemas/projectSchema.js';

const StyledContainer = styled(Container)(({ theme }) => ({
  paddingTop: theme.spacing(4),
  paddingBottom: theme.spacing(8),
}));

const SearchContainer = styled(Box)(({ theme }) => ({
  background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.secondary.main, 0.1)})`,
  borderRadius: theme.spacing(2),
  padding: theme.spacing(3),
  marginBottom: theme.spacing(4),
}));

const FilterChip = styled(Chip)(({ theme }) => ({
  margin: theme.spacing(0.5),
  '&.active': {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
  }
}));

const ProjectCard = styled(Card)(({ theme }) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  transition: 'all 0.3s ease-in-out',
  position: 'relative',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: theme.shadows[8],
  }
}));

const CategoryBadge = styled(Chip)(({ theme }) => ({
  position: 'absolute',
  top: theme.spacing(1),
  right: theme.spacing(1),
  fontSize: '0.75rem',
  height: 24,
}));

const StatsChip = styled(Chip)(({ theme }) => ({
  fontSize: '0.75rem',
  height: 20,
  '& .MuiChip-icon': {
    fontSize: '0.875rem',
  }
}));

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`projects-tabpanel-${index}`}
      aria-labelledby={`projects-tab-${index}`}
      {...other}
    >
      {value === index && children}
    </div>
  );
}

const ProjectsDiscovery = () => {
  // State management
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [selectedAccessType, setSelectedAccessType] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [sortBy, setSortBy] = useState('relevance');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // In a real app, this would fetch from an API
        setProjects(projectsData.projects);
        setCategories(projectsData.categories);
        setLoading(false);
      } catch (error) {
        console.error('Error loading projects:', error);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Compute available filter options from data
  const filterOptions = useMemo(() => {
    if (!projects.length) return { tags: [], platforms: [], techStack: [] };

    const allTags = new Set();
    const allPlatforms = new Set();
    const allTechStack = new Set();

    projects.forEach(project => {
      project.tags?.forEach(tag => allTags.add(tag));
      project.platforms?.forEach(platform => allPlatforms.add(platform));
      Object.values(project.techStack || {}).flat().forEach(tech => allTechStack.add(tech));
    });

    return {
      tags: Array.from(allTags).sort(),
      platforms: Array.from(allPlatforms).sort(),
      techStack: Array.from(allTechStack).sort()
    };
  }, [projects]);

  // Filter and sort projects
  const filteredProjects = useMemo(() => {
    let filtered = [...projects];

    // Text search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(project =>
        project.searchText?.includes(term) ||
        project.name.toLowerCase().includes(term) ||
        project.description.toLowerCase().includes(term) ||
        project.author.toLowerCase().includes(term)
      );
    }

    // Category filter
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(project => selectedCategories.includes(project.category));
    }

    // Tags filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter(project =>
        selectedTags.some(tag => project.tags?.includes(tag))
      );
    }

    // Platform filter
    if (selectedPlatforms.length > 0) {
      filtered = filtered.filter(project =>
        selectedPlatforms.some(platform => project.platforms?.includes(platform))
      );
    }

    // Access type filter
    if (selectedAccessType) {
      filtered = filtered.filter(project => project.accessType === selectedAccessType);
    }

    // Difficulty filter
    if (selectedDifficulty) {
      filtered = filtered.filter(project => project.difficulty === selectedDifficulty);
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'stars':
          return (b.stars || 0) - (a.stars || 0);
        case 'newest':
          return new Date(b.submissionDate || 0) - new Date(a.submissionDate || 0);
        case 'updated':
          return new Date(b.lastUpdated || b.submissionDate || 0) - new Date(a.lastUpdated || a.submissionDate || 0);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'featured':
          return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
        default: // relevance
          return (b.qualityScore || 50) - (a.qualityScore || 50);
      }
    });

    return filtered;
  }, [projects, searchTerm, selectedCategories, selectedTags, selectedPlatforms, selectedAccessType, selectedDifficulty, sortBy]);

  // Projects by category for tab view
  const projectsByCategory = useMemo(() => {
    const grouped = {};
    categories.forEach(cat => {
      grouped[cat.id] = filteredProjects.filter(p => p.category === cat.id);
    });
    return grouped;
  }, [filteredProjects, categories]);

  const clearAllFilters = () => {
    setSearchTerm('');
    setSelectedCategories([]);
    setSelectedTags([]);
    setSelectedPlatforms([]);
    setSelectedAccessType('');
    setSelectedDifficulty('');
    setSortBy('relevance');
  };

  const getCategoryInfo = (categoryId) => {
    return categories.find(cat => cat.id === categoryId);
  };

  const renderProjectCard = (project) => (
    <Grid item xs={12} sm={6} md={4} lg={3} key={project.id}>
      <ProjectCard>
        {/* Category Badge */}
        <CategoryBadge
          label={getCategoryInfo(project.category)?.icon || ''}
          size="small"
          style={{ backgroundColor: getCategoryInfo(project.category)?.color }}
        />

        <CardContent sx={{ flexGrow: 1, pt: 4 }}>
          {/* Project Title */}
          <Box display="flex" alignItems="center" mb={1}>
            <Typography variant="h6" component="h3" noWrap sx={{ flexGrow: 1 }}>
              {project.name}
              {project.isNew && (
                <Tooltip title="Recently added">
                  <NewIcon color="primary" sx={{ ml: 1, fontSize: '1rem' }} />
                </Tooltip>
              )}
              {project.verified && (
                <Tooltip title="Verified by team">
                  <VerifiedIcon color="primary" sx={{ ml: 0.5, fontSize: '1rem' }} />
                </Tooltip>
              )}
            </Typography>
          </Box>

          {/* Author */}
          <Typography variant="body2" color="text.secondary" gutterBottom>
            by {project.author}
          </Typography>

          {/* Description */}
          <Typography variant="body2" color="text.secondary" sx={{
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: '3.6em',
            mb: 2
          }}>
            {project.description}
          </Typography>

          {/* Tags */}
          <Box mb={2}>
            {project.tags?.slice(0, 3).map(tag => (
              <FilterChip
                key={tag}
                label={tag}
                size="small"
                variant="outlined"
                sx={{ mr: 0.5, mb: 0.5 }}
              />
            ))}
            {project.tags?.length > 3 && (
              <Chip
                label={`+${project.tags.length - 3}`}
                size="small"
                variant="outlined"
                sx={{ mr: 0.5, mb: 0.5 }}
              />
            )}
          </Box>

          {/* Stats */}
          <Box display="flex" gap={1} flexWrap="wrap">
            {project.stars && (
              <StatsChip
                icon={<StarIcon />}
                label={project.stars.toLocaleString()}
                size="small"
                variant="outlined"
              />
            )}
            <StatsChip
              label={project.difficulty}
              size="small"
              variant="outlined"
              color={project.difficulty === 'beginner' ? 'success' : project.difficulty === 'advanced' ? 'error' : 'default'}
            />
            <StatsChip
              label={project.accessType}
              size="small"
              variant="outlined"
              color={project.accessType === 'free' || project.accessType === 'open-source' ? 'success' : 'default'}
            />
          </Box>
        </CardContent>

        <CardActions sx={{ mt: 'auto', justifyContent: 'space-between' }}>
          <Button
            size="small"
            startIcon={<OpenIcon />}
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Visit
          </Button>
          {project.repo && (
            <IconButton
              size="small"
              href={project.repo}
              target="_blank"
              rel="noopener noreferrer"
              title="View on GitHub"
            >
              <GitHubIcon />
            </IconButton>
          )}
        </CardActions>
      </ProjectCard>
    </Grid>
  );

  const renderFilterDialog = () => (
    <Dialog open={showFilters} onClose={() => setShowFilters(false)} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          Filter Projects
          <IconButton onClick={() => setShowFilters(false)}>
            <ClearIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={3}>
          {/* Categories */}
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Categories</InputLabel>
              <Select
                multiple
                value={selectedCategories}
                onChange={(e) => setSelectedCategories(e.target.value)}
                input={<OutlinedInput label="Categories" />}
                renderValue={(selected) => selected.map(id => getCategoryInfo(id)?.title).join(', ')}
              >
                {categories.map(category => (
                  <MenuItem key={category.id} value={category.id}>
                    <Checkbox checked={selectedCategories.includes(category.id)} />
                    <ListItemText primary={category.title} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Platforms */}
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Platforms</InputLabel>
              <Select
                multiple
                value={selectedPlatforms}
                onChange={(e) => setSelectedPlatforms(e.target.value)}
                input={<OutlinedInput label="Platforms" />}
                renderValue={(selected) => selected.join(', ')}
              >
                {filterOptions.platforms.map(platform => (
                  <MenuItem key={platform} value={platform}>
                    <Checkbox checked={selectedPlatforms.includes(platform)} />
                    <ListItemText primary={platform} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Tags */}
          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Technologies & Tags</InputLabel>
              <Select
                multiple
                value={selectedTags}
                onChange={(e) => setSelectedTags(e.target.value)}
                input={<OutlinedInput label="Technologies & Tags" />}
                renderValue={(selected) => selected.join(', ')}
              >
                {filterOptions.tags.map(tag => (
                  <MenuItem key={tag} value={tag}>
                    <Checkbox checked={selectedTags.includes(tag)} />
                    <ListItemText primary={tag} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Access Type */}
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Access Type</InputLabel>
              <Select
                value={selectedAccessType}
                onChange={(e) => setSelectedAccessType(e.target.value)}
                label="Access Type"
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="free">Free</MenuItem>
                <MenuItem value="open-source">Open Source</MenuItem>
                <MenuItem value="freemium">Freemium</MenuItem>
                <MenuItem value="paid">Paid</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Difficulty */}
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Difficulty</InputLabel>
              <Select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                label="Difficulty"
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="beginner">Beginner</MenuItem>
                <MenuItem value="intermediate">Intermediate</MenuItem>
                <MenuItem value="advanced">Advanced</MenuItem>
                <MenuItem value="expert">Expert</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={clearAllFilters}>Clear All</Button>
        <Button onClick={() => setShowFilters(false)} variant="contained">Apply Filters</Button>
      </DialogActions>
    </Dialog>
  );

  if (loading) {
    return (
      <StyledContainer>
        <Typography variant="h3" component="h1" gutterBottom align="center">
          Discover Projects
        </Typography>
        <Grid container spacing={3}>
          {Array.from({ length: 12 }).map((_, index) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
              <Card>
                <CardContent>
                  <Skeleton variant="text" width="80%" height={32} />
                  <Skeleton variant="text" width="60%" height={20} />
                  <Skeleton variant="rectangular" width="100%" height={60} sx={{ my: 2 }} />
                  <Box display="flex" gap={1}>
                    <Skeleton variant="rounded" width={60} height={24} />
                    <Skeleton variant="rounded" width={80} height={24} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </StyledContainer>
    );
  }

  return (
    <StyledContainer>
      {/* Header */}
      <Box textAlign="center" mb={6}>
        <Typography variant="h2" component="h1" gutterBottom>
          Discover Projects 🌟
        </Typography>
        <Typography variant="h5" color="text.secondary" paragraph>
          Explore the amazing ecosystem of projects built with Pollinations.AI
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {projects.length} projects across {categories.length} categories
        </Typography>
      </Box>

      {/* Search and Filter Controls */}
      <SearchContainer>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                endAdornment: searchTerm && (
                  <IconButton onClick={() => setSearchTerm('')} size="small">
                    <ClearIcon />
                  </IconButton>
                )
              }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Sort by</InputLabel>
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                label="Sort by"
              >
                <MenuItem value="relevance">Relevance</MenuItem>
                <MenuItem value="stars">GitHub Stars</MenuItem>
                <MenuItem value="newest">Newest</MenuItem>
                <MenuItem value="updated">Recently Updated</MenuItem>
                <MenuItem value="name">Name (A-Z)</MenuItem>
                <MenuItem value="featured">Featured First</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <Box display="flex" gap={1}>
              <Button
                variant="outlined"
                startIcon={<FilterIcon />}
                onClick={() => setShowFilters(true)}
                fullWidth
              >
                Filters
              </Button>
              <IconButton onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}>
                {viewMode === 'grid' ? <ListViewIcon /> : <GridViewIcon />}
              </IconButton>
            </Box>
          </Grid>
        </Grid>

        {/* Active Filters */}
        {(selectedCategories.length > 0 || selectedTags.length > 0 || selectedPlatforms.length > 0) && (
          <Box mt={2}>
            <Typography variant="body2" gutterBottom>Active filters:</Typography>
            <Box display="flex" flexWrap="wrap" gap={0.5}>
              {selectedCategories.map(cat => (
                <FilterChip
                  key={cat}
                  label={getCategoryInfo(cat)?.title}
                  onDelete={() => setSelectedCategories(prev => prev.filter(c => c !== cat))}
                  className="active"
                />
              ))}
              {selectedTags.map(tag => (
                <FilterChip
                  key={tag}
                  label={tag}
                  onDelete={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
                  className="active"
                />
              ))}
              {selectedPlatforms.map(platform => (
                <FilterChip
                  key={platform}
                  label={platform}
                  onDelete={() => setSelectedPlatforms(prev => prev.filter(p => p !== platform))}
                  className="active"
                />
              ))}
              <Button size="small" onClick={clearAllFilters}>
                Clear all
              </Button>
            </Box>
          </Box>
        )}
      </SearchContainer>

      {/* Results Summary */}
      <Box mb={3}>
        <Typography variant="body1">
          Showing {filteredProjects.length} of {projects.length} projects
          {searchTerm && ` for "${searchTerm}"`}
        </Typography>
      </Box>

      {/* Category Tabs */}
      <AppBar position="static" color="transparent" elevation={0} sx={{ mb: 3 }}>
        <Tabs
          value={selectedTab}
          onChange={(e, newValue) => setSelectedTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label={`All (${filteredProjects.length})`} />
          {categories.map((category, index) => (
            <Tab
              key={category.id}
              label={`${category.title} (${projectsByCategory[category.id]?.length || 0})`}
            />
          ))}
        </Tabs>
      </AppBar>

      {/* Projects Grid */}
      <TabPanel value={selectedTab} index={0}>
        {filteredProjects.length === 0 ? (
          <Alert severity="info" sx={{ mt: 4 }}>
            No projects match your current filters. Try adjusting your search criteria.
          </Alert>
        ) : (
          <Grid container spacing={3}>
            {filteredProjects.map(renderProjectCard)}
          </Grid>
        )}
      </TabPanel>

      {/* Category-specific tabs */}
      {categories.map((category, index) => (
        <TabPanel key={category.id} value={selectedTab} index={index + 1}>
          {projectsByCategory[category.id]?.length === 0 ? (
            <Alert severity="info" sx={{ mt: 4 }}>
              No {category.title.toLowerCase()} projects match your current filters.
            </Alert>
          ) : (
            <Grid container spacing={3}>
              {projectsByCategory[category.id]?.map(renderProjectCard)}
            </Grid>
          )}
        </TabPanel>
      ))}

      {/* Filter Dialog */}
      {renderFilterDialog()}

      {/* Floating Action Button */}
      <Fab
        color="primary"
        sx={{ position: 'fixed', bottom: 24, right: 24 }}
        href="https://github.com/pollinations/pollinations/issues/new?template=project-submission.yml"
        target="_blank"
        title="Submit Your Project"
      >
        +
      </Fab>
    </StyledContainer>
  );
};

export default ProjectsDiscovery;