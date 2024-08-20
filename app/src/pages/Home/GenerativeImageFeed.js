import { useState, useEffect, useCallback } from 'react';
import { Typography, ButtonGroup, Grid, Link, Box, Paper, Table, TableBody, TableCell, TableRow, TextField, CircularProgress, Slider, TableContainer, Checkbox, Tooltip, IconButton, Collapse, Button, Tabs, Tab, TextareaAutosize, Select, MenuItem, FormControl, InputLabel, Accordion, AccordionSummary, AccordionDetails } from '@material-ui/core';
import InfoIcon from '@material-ui/icons/Info';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { debounce } from 'lodash';
import { CodeExamples } from './CodeExamples';
import { useFeedLoader } from './useFeedLoader';
import { useImageEditor, useImageSlideshow } from './useImageSlideshow';
import { GenerativeImageURLContainer, ImageURLHeading, ImageContainer, ImageStyle } from './styles';
import { Colors, Headline, MOBILE_BREAKPOINT, HUGE_BREAKPOINT, BaseContainer } from '../../styles/global';
import DiscordIMG from '../../assets/icons/discord_logo1.svg';
import debug from 'debug';
import { ServerLoadAndGenerationInfo } from './ServerLoadAndGenerationInfo';

const log = debug("GenerativeImageFeed");

export function GenerativeImageFeed() {
  const [lastImage, setLastImage] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const [imageParams, setImageParams] = useState({});
  const { image: slideshowImage, onNewImage, stop } = useImageSlideshow();
  const { updateImage, image, isLoading } = useImageEditor({ stop, image: slideshowImage });
  const { imagesGenerated } = useFeedLoader(onNewImage, setLastImage);

  useEffect(() => {
    setImageParams(image);
  }, [image]);

  const handleParamChange = (param, value) => {
    setImageParams(prevParams => ({
      ...prevParams,
      [param]: value,
    }));
  };

  const handleSubmit = () => {
    const imageURL = getImageURL(imageParams);
    updateImage({
      ...imageParams,
      imageURL
    });
  };

  const handleFocus = () => {
    stop(true); // Stop the slideshow when any form control is focused
  };

  return (
    <GenerativeImageURLContainer style={{ paddingBottom: '3em' }}>
      <Grid item xs={12}>
        <ImageURLHeading>Image Feed</ImageURLHeading>
      </Grid>
      {!image["imageURL"] ? (
        <Grid container justify="center" alignItems="center" style={{ marginBottom: "8em" }}>
          <CircularProgress color={'inherit'} style={{ color: Colors.offwhite }} />
        </Grid>
      ) : (
        <Grid container spacing={4} direction="column">
          <Grid item xs={12}>
            <ServerLoadAndGenerationInfo {...{ lastImage, imagesGenerated, image }} />
            <ImageContainer style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {image ? (<>
                <Link href={image["imageURL"]} target="_blank" rel="noopener noreferrer">
                  <ImageStyle
                    src={image["imageURL"]}
                    alt="generative_image"
                  />
                </Link>
                <ModelInfo model={image["model"]} />
              </>
              ) : (
                <Typography variant="h6" color="textSecondary">Loading image...</Typography>
              )}
            </ImageContainer>
          </Grid>
          <Grid item xs={12}>
            <Box display="flex" justifyContent="center" >
              <ButtonGroup aria-label="edit-integrate-button-group" style={{ border: 'none' }}>
                <Button
                  onClick={() => setTabValue(0)}
                  variant={tabValue === 0 ? "contained" : "text"}
                  color={tabValue === 0 ? Colors.offblack : Colors.lime}
                  style={{ color: tabValue === 0 ? Colors.offblack : Colors.lime, backgroundColor: tabValue === 0 ? Colors.lime : "transparent", boxShadow: 'none', width: "150px", height: "50px", fontSize: "1rem" }}
                >
                  Edit
                </Button>
                <Button
                  onClick={() => setTabValue(1)}
                  variant={tabValue === 1 ? "contained" : "text"}
                  style={{ color: tabValue === 1 ? Colors.offblack : Colors.lime, backgroundColor: tabValue === 1 ? Colors.lime : "transparent", boxShadow: 'none', width: "150px", height: "50px", fontSize: "1rem" }}
                >
                  Integrate
                </Button>
              </ButtonGroup>
            </Box>
            <Box>
              {tabValue === 0 && <ImageData {...{ image: imageParams, handleParamChange, handleFocus, isLoading, handleSubmit }} />}
              {tabValue === 1 && (
                <>
                  <CodeExamples {...image} />
                </>
              )}
              {isLoading && (
                <Box display="flex" flexDirection="column" alignItems="center" margin="30px auto">
                  <CircularProgress color={'inherit'} style={{ color: Colors.lime }} />
                  <Typography style={{ color: Colors.lime, marginTop: '10px' }}>
                    Generating...
                  </Typography>
                </Box>
              )}
            </Box>
          </Grid>
        </Grid>
      )}
    </GenerativeImageURLContainer>
  );
}

function ModelInfo({ model }) {

  if (model === "turbo") {
    return <Typography variant="caption" color="textSecondary" style={{ marginTop: '10px', textAlign: 'center' }}>
      Model: <Link href="https://civitai.com/models/413466/boltning-realistic-lightning-hyper" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>Boltning</Link>
      &nbsp;&nbsp;
      LoRA: <Link href="https://huggingface.co/tianweiy/DMD2" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>DMD2</Link>
      &nbsp;&nbsp;
      Prompt Enhancer: <Link href="https://github.com/pollinations/pollinations/blob/master/image_gen_server/groqPimp.js" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>Groq</Link>
    </Typography>;
  }

  if (model === "flux") {
    return <Typography variant="caption" color="textSecondary" style={{ marginTop: '10px', textAlign: 'center' }}>
      Model: <Link href="https://blackforestlabs.ai/" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>Flux.Schnell</Link>
      &nbsp;&nbsp;
      Prompt Enhancer: <Link href="https://github.com/pollinations/pollinations/blob/master/image_gen_server/groqPimp.js" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>Groq</Link>
    </Typography>;
  }
}

function getImageURL(newImage) {
  let imageURL = `https://pollinations.ai/p/${encodeURIComponent(newImage.prompt)}`;
  let queryParams = [];
  if (newImage.width && newImage.width !== 1024 && newImage.width !== "1024") queryParams.push(`width=${newImage.width}`);
  if (newImage.height && newImage.height !== 1024 && newImage.height !== "1024") queryParams.push(`height=${newImage.height}`);
  if (newImage.seed && newImage.seed !== 42 && newImage.seed !== "42") queryParams.push(`seed=${newImage.seed}`);
  if (newImage.nofeed) queryParams.push(`nofeed=${newImage.nofeed}`);
  if (newImage.nologo) queryParams.push(`nologo=${newImage.nologo}`);
  if (newImage.model && newImage.model !== "turbo") queryParams.push(`model=${newImage.model}`);

  if (queryParams.length > 0) {
    imageURL += '?' + queryParams.join('&');
  }

  return imageURL;
}

function ImageData({ image, handleParamChange, handleFocus, isLoading, handleSubmit }) {
  const { prompt, width, height, seed, imageURL, nofeed, nologo, model } = image;

  if (!imageURL) {
    return <Typography variant="body2" color="textSecondary">Loading...</Typography>;
  }

  return (
    <Box component={Paper} style={{ border: 'none', boxShadow: 'none', marginTop: '20px', backgroundColor: "transparent" }}>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Typography variant="body2" color="textSecondary">Prompt</Typography>
          <TextareaAutosize
            minRows={3}
            style={{ width: '100%', backgroundColor: 'transparent', color: Colors.white, padding: '10px', fontSize: '1.2rem' }}
            value={prompt}
            onChange={(e) => handleParamChange('prompt', e.target.value)}
            onFocus={handleFocus}
            disabled={isLoading}
          />
        </Grid>
        <Grid item xs={12}>
          <Box display="flex" justifyContent="flex-end" mt={2}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSubmit}
              disabled={isLoading}
              style={{
                backgroundColor: Colors.lime,
                color: Colors.offblack,
                padding: '10px 20px',
              }}
            >
              Imagine
            </Button>
          </Box>
        </Grid>
        <Grid item xs={12}>
          <Accordion style={{ backgroundColor: 'transparent', color: Colors.white }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon style={{ color: Colors.lime }} />}>
              <Typography>Advanced Options</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography variant="body2" color="textSecondary">Model</Typography>
                  <FormControl fullWidth>
                    <Select
                      value={model || "turbo"}
                      onChange={(e) => handleParamChange('model', e.target.value)}
                      onFocus={handleFocus}
                      disabled={isLoading}
                      style={{ color: Colors.white, width: '100%' }}
                    >
                      <MenuItem value="turbo">Turbo</MenuItem>
                      <MenuItem value="flux">Flux</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={8}>
                  <Typography variant="body2" color="textSecondary">Dimensions</Typography>
                  <Box display="flex" alignItems="center">
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
                      style={{ marginRight: '10px', width: '45%' }}
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
                      style={{ width: '45%' }}
                    />
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
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
                <Grid item xs={12} sm={6} md={8}>
                  <Box display="flex" justifyContent="space-around" alignItems="center" height="100%">
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
        </Grid>
      </Grid>
    </Box>
  );
}