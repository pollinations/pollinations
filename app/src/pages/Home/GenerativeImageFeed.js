import { useState, useEffect, useCallback } from 'react';
import { Typography, ButtonGroup, Grid, Link, Box, Paper, Table, TableBody, TableCell, TableRow, TextField, CircularProgress, Slider, TableContainer, Checkbox, Tooltip, IconButton, Collapse, Button, Tabs, Tab } from '@material-ui/core';
import InfoIcon from '@material-ui/icons/Info';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { debounce } from 'lodash';
import { CodeExamples } from './CodeExamples';
import { useFeedLoader } from './useFeedLoader';
import { useImageEditor, useImageSlideshow } from './useImageSlideshow';
import { GenerativeImageURLContainer, ImageURLHeading, ImageContainer, ImageStyle } from './styles';
import { Colors, Headline, MOBILE_BREAKPOINT, HUGE_BREAKPOINT, BaseContainer } from '../../styles/global';
import DiscordIMG from '../../assets/icons/discord_logo1.svg' // Corrected the path to the discord image

export function GenerativeImageFeed() {
  const [serverLoad, setServerLoad] = useState(0);
  const [tabValue, setTabValue] = useState(0);
  const { image: slideshowImage, onNewImage, stop } = useImageSlideshow();
  const { updateImage, isWaiting, image } = useImageEditor({ stop, image: slideshowImage });
  const { imagesGenerated } = useFeedLoader(onNewImage, setServerLoad);

  const handleParamChange = (param, value) => {
    const newImage = {
      ...image,
      [param]: value,
    };
    const imageURL = getImageURL(newImage);

    updateImage({
      ...newImage,
      imageURL
    });
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const gridItemSize = window.innerWidth > parseInt(MOBILE_BREAKPOINT) ? 6 : 12;

  return (
    <GenerativeImageURLContainer style={{ paddingBottom: window.innerWidth <= parseInt(MOBILE_BREAKPOINT) ? '3em' : '0' }}>
      <Grid item xs={12}>
        <ImageURLHeading>Image Feed</ImageURLHeading>
      </Grid>
      {!image["imageURL"] ? (
        <Grid container justify="center" alignItems="center" style={{ marginBottom: "8em" }}>
          <CircularProgress color={'inherit'} style={{ color: Colors.offwhite }} />
        </Grid>
      ) : (
        <Grid container spacing={4}>
          <Grid item xs={gridItemSize}>
            <ServerLoadAndGenerationInfo {...{ serverLoad, imagesGenerated, image }} />
            <ImageContainer style={{ display: 'flex', justifyContent: 'center' }}>
              {image ? (
                <Link href={image["imageURL"]} target="_blank" rel="noopener noreferrer">
                  <ImageStyle
                    src={image["imageURL"]}
                    alt="generative_image"
                  />
                </Link>
              ) : (
                <Typography variant="h6" color="textSecondary">Loading image...</Typography>
              )}
            </ImageContainer>
          </Grid>
          <Grid item xs={gridItemSize} >
            <Box display="flex" justifyContent="center" >
              <ButtonGroup aria-label="edit-integrate-button-group" style={{ border: 'none' }}>
                <Button
                  onClick={() => setTabValue(0)}
                  variant={tabValue === 0 ? "contained" : "text"}
                  color={tabValue === 0 ? "offblack" : "lime"}
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
            {/* <Box display="flex" justifyContent="center">
              <Typography color="textSecondary" style={{ color: Colors.offwhite, marginTop: '3em', textAlign: 'center' }}>Tweak Your Image in Real-Time. Instant Results at Your Fingertips.</Typography>
            </Box> */}
            <Box>
              {tabValue === 0 && <ImageData {...{ image, handleParamChange }} />}
              {tabValue === 1 && <CodeExamples {...image} />}
              {isWaiting && <CircularProgress color={'inherit'}  style={{ color: Colors.lime, margin: '30px auto', display: 'block' }} />}
            </Box>
          </Grid>
        </Grid>
      )}
    </GenerativeImageURLContainer>
  );
}

function getImageURL(newImage) {
  let imageURL = `https://pollinations.ai/p/${encodeURIComponent(newImage.prompt)}`;
  let queryParams = [];
  if (newImage.width && newImage.width !== 1024 && newImage.width !== "1024") queryParams.push(`width=${newImage.width}`);
  if (newImage.height && newImage.height !== 1024 && newImage.height !== "1024") queryParams.push(`height=${newImage.height}`);
  if (newImage.seed && newImage.seed !== 42 && newImage.seed !== "42") queryParams.push(`seed=${newImage.seed}`);
  if (newImage.nofeed) queryParams.push(`nofeed=${newImage.nofeed}`);
  if (newImage.nologo) queryParams.push(`nologo=${newImage.nologo}`);

  if (queryParams.length > 0) {
    imageURL += '?' + queryParams.join('&');
  }
  return imageURL;
}

function TimingInfo({ image }) {
  const timeMs = image?.timingInfo?.[5].timestamp;
  return <Typography variant="body2" component="i">Generation time:<span style={{ color: Colors.lime }}><b> {Math.round(timeMs / 10) / 100} s</b></span></Typography>}
function ImageData({ image, handleParamChange }) {
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false);

  const toggleAdvancedOptions = () => {
    setAdvancedOptionsOpen(!advancedOptionsOpen);
  };

  const { prompt, width, height, seed, imageURL, nofeed, nologo } = image;
  if (!imageURL) {
    return <Typography variant="body2" color="textSecondary">Loading...</Typography>;
  }
  return (
    <>
      <TableContainer component={Paper} style={{ border: 'none', boxShadow: 'none', marginTop: '30px', backgroundColor: "transparent" }}>
        <Table aria-label="image info table" size="small" style={{ borderCollapse: 'collapse' }}>
          <TableBody height='450px'  >
            <TableRow key="prompt" style={{ borderBottom: 'none' }}>
              <TableCell align="left" component="th" scope="row" style={{ borderBottom: 'none' }}>prompt</TableCell>
              <TableCell align="right" style={{ borderBottom: 'none' }}>
                <TextField
                  fullWidth
                  variant="outlined"
                  value={prompt}
                  onChange={(e) => handleParamChange('prompt', e.target.value)}
                  type="text"
                  InputProps={{
                    style: { color: Colors.white },
                    classes: { notchedOutline: { borderColor: Colors.white } },
                  }}
                />
              </TableCell>
            </TableRow>
            <TableRow key="width" style={{ borderBottom: 'none' }}>
              <TableCell align="left" style={{ borderBottom: 'none' }} component="th" scope="row">width</TableCell>
              <TableCell style={{ borderBottom: 'none' }}>
                <Slider
                  value={width || 1024}
                  onChange={(e, newValue) => handleParamChange('width', newValue)}
                  aria-labelledby="width-slider"
                  valueLabelDisplay="on"
                  step={16}
                  marks
                  min={16}
                  max={2048}
                  style={{ marginTop: "30px", color: Colors.white}}
                  ThumbComponent={props => <span {...props} style={{...props.style, backgroundColor: Colors.lime}} />}
                />
              </TableCell>
            </TableRow>
            <TableRow key="height" style={{ borderBottom: 'none' }}>
              <TableCell component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>height</TableCell>
              <TableCell align="left" style={{ borderBottom: 'none' }}>
                <Slider
                  value={height || 1024}
                  onChange={(e, newValue) => handleParamChange('height', newValue)}
                  aria-labelledby="height-slider"
                  valueLabelDisplay="on"
                  step={16}
                  marks
                  min={16}
                  max={2048}
                  style={{ marginTop: "30px", color: Colors.white }}
                  ThumbComponent={props => <span {...props} style={{...props.style, backgroundColor: Colors.lime}} />}
                />
              </TableCell>
            </TableRow>
            <TableRow key="seed" style={{ borderBottom: 'none' }}>
              <TableCell align="left" component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>seed</TableCell>
              <TableCell align="left" style={{ borderBottom: 'none' }}>
                <TextField
                  fullWidth
                  variant="outlined"
                  value={seed}
                  onChange={(e) => handleParamChange('seed', parseInt(e.target.value))}
                  onFocus={() => handleParamChange('seed', seed)}
                  type="number"
                  style={{ width: "25%" }}
                  InputProps={{
                    style: { color: Colors.white },
                    classes: { notchedOutline: { borderColor: Colors.lime } },
                  }}
                />
              </TableCell>
            </TableRow>
            <TableRow key="nofeed" style={{ borderBottom: 'none' }}>
              <TableCell align="left" component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>
                private
                <Tooltip title="Activating 'private' prevents images from appearing in the feed."  style={{ color: Colors.lime}}>
                  <IconButton size="small">
                    <InfoIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
              <TableCell align="left" style={{ borderBottom: 'none', display: 'flex', alignItems: 'center' }}>
                <Checkbox
                  checked={nofeed}
                  onChange={(e) => handleParamChange('nofeed', e.target.checked)}
                />
              </TableCell>
            </TableRow>
            <TableRow key="nologo" style={{ borderBottom: 'none' }}>
              <TableCell align="left" component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>
                nologo
                <Tooltip title="Hide the pollinations.ai logo. Get the password in Pollinations' Discord community." style={{ color: Colors.lime }}>
                  <IconButton size="small">
                    <InfoIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
              <TableCell align="left" style={{ borderBottom: 'none', display: 'flex', alignItems: 'center' }}>
                <TextField
                  type="password"
                  variant="outlined"
                  onChange={(e) => handleParamChange('nologo', e.target.value)}
                  style={{ width: "25%" }}
                  value={nologo ? nologo : ""}
                  InputProps={{
                    style: { color: Colors.white },
                    classes: { notchedOutline: { borderColor: Colors.lime } },
                  }}
                />
  <IconButton
    component="a"
    href="https://discord.gg/8HqSRhJVxn"
    target="_blank"
    rel="noopener noreferrer"
    style={{ marginLeft: '20px', backgroundColor: 'transparent', color: 'red' }} >
    <img src={DiscordIMG} alt="Discord" style={{ width: '100px' }} />
  </IconButton>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}

function ServerLoadAndGenerationInfo({ serverLoad, imagesGenerated, image }) {
  return (
    <Box display="flex" justifyContent="space-between" alignItems="center" >
      <ServerLoadDisplay concurrentRequests={serverLoad} />
      <Typography variant="body1" component="span" >
        #: <b style={{ color: Colors.lime }}>{formatImagesGenerated(imagesGenerated)}</b>
      </Typography >
      <TimingInfo image={image} />
    </Box>
  );
}
function ServerLoadDisplay({ concurrentRequests }) {
  concurrentRequests = Math.round(concurrentRequests / 2);
  const max = 5;
  const load = Math.min(max, concurrentRequests);
  const loadDisplay = "▁▃▅▇▉".slice(1, load + 2);

  return <span>Server Load: <b style={{ color: Colors.lime }}>{loadDisplay}</b></span>;
}

const formatImagesGenerated = (num) => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

