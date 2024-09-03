import React from 'react';
import { Grid, Typography, FormControl, Select, MenuItem, TextField, Box, Checkbox, Tooltip, IconButton, Accordion, AccordionSummary, AccordionDetails } from '@material-ui/core';
import InfoIcon from '@material-ui/icons/Info';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { Colors } from '../../../styles/global';
import { Link } from '@material-ui/core';

export function AdvancedOptions({ image, handleParamChange, handleFocus, isLoading }) {
    const { width, height, seed, nofeed, nologo, model } = image;

    return (
        <Accordion style={{ backgroundColor: 'transparent', color: Colors.white }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon style={{ color: Colors.lime }} />}>
                <Typography>Advanced Options</Typography>
            </AccordionSummary>
            <AccordionDetails>
                <Grid container direction="column" spacing={2}>
                    <Grid item>
                        <Typography variant="body2" color="textSecondary">Model</Typography>
                        <FormControl fullWidth>
                            <Select
                                value={model || "flux"}
                                onChange={(e) => handleParamChange('model', e.target.value)}
                                onFocus={handleFocus}
                                disabled={isLoading}
                                style={{ color: Colors.white, width: '100%' }}
                            >
                                <MenuItem value="turbo">Turbo</MenuItem>
                                <MenuItem value="flux">Flux</MenuItem>
                                <MenuItem value="flux-realism">Flux-Realism</MenuItem>
                                <MenuItem value="flux-anime">Flux-Anime</MenuItem>
                                <MenuItem value="flux-3d">Flux-3D</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item>
                        <Typography variant="body2" color="textSecondary">Dimensions</Typography>
                        <Box display="flex" flexDirection="column" alignItems="center">
                            <TextField
                                variant="outlined"
                                value={width}
                                onChange={(e) => handleParamChange('width', parseInt(e.target.value))}
                                onFocus={handleFocus}
                                type="number"
                                InputProps={{
                                    style: { color: Colors.white },
                                }}
                                disabled={isLoading}
                                style={{ marginBottom: '10px', width: '100%' }}
                            />
                            <Typography variant="body2" color="textSecondary" style={{ margin: '0 10px' }}>x</Typography>
                            <TextField
                                variant="outlined"
                                value={height}
                                onChange={(e) => handleParamChange('height', parseInt(e.target.value))}
                                onFocus={handleFocus}
                                type="number"
                                InputProps={{
                                    style: { color: Colors.white },
                                }}
                                disabled={isLoading}
                                style={{ width: '100%' }}
                            />
                        </Box>
                    </Grid>
                    <Grid item>
                        <Typography variant="body2" color="textSecondary">Seed</Typography>
                        <TextField
                            fullWidth
                            variant="outlined"
                            value={seed}
                            onChange={(e) => handleParamChange('seed', parseInt(e.target.value))}
                            onFocus={handleFocus}
                            type="number"
                            InputProps={{
                                style: { color: Colors.white },
                            }}
                            disabled={isLoading}
                        />
                    </Grid>
                    <Grid item>
                        <Box display="flex" flexDirection="row" alignItems="center" justifyContent="space-between">
                            <Box>
                                <Typography variant="body2" color="textSecondary">
                                    Private
                                    <Tooltip title="Activating 'private' prevents images from appearing in the feed." style={{ color: Colors.lime }}>
                                        <IconButton size="small">
                                            <InfoIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Typography>
                                <Checkbox
                                    checked={nofeed}
                                    onChange={(e) => handleParamChange('nofeed', e.target.checked)}
                                    onFocus={handleFocus}
                                    disabled={isLoading}
                                />
                            </Box>
                            <Box>
                                <Typography variant="body2" color="textSecondary">
                                    No Logo
                                    <Tooltip title={<span>Hide the pollinations.ai logo. Get the password in Pollinations' Discord community. <Link href="https://discord.gg/k9F7SyTgqn" target="_blank" style={{ color: Colors.lime }}>Join here</Link></span>} interactive style={{ color: Colors.lime }}>
                                        <IconButton size="small">
                                            <InfoIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Typography>
                                <Checkbox
                                    checked={nologo}
                                    onChange={(e) => handleParamChange('nologo', e.target.checked)}
                                    onFocus={handleFocus}
                                    disabled={isLoading}
                                />
                            </Box>
                        </Box>
                    </Grid>
                </Grid>
            </AccordionDetails>
        </Accordion>
    );
}