import { useState, useEffect, useCallback } from 'react';
import { Typography, ButtonGroup, Grid, Link, Box, Paper, Table, TableBody, TableCell, TableRow, TextField, CircularProgress, Slider, TableContainer, Checkbox, Tooltip, IconButton, Collapse, Button, Tabs, Tab, TextareaAutosize } from '@material-ui/core';
import InfoIcon from '@material-ui/icons/Info';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { debounce } from 'lodash';
import { CodeExamples } from './CodeExamples';
import { useFeedLoader } from './useFeedLoader';
import { useImageEditor, useImageSlideshow } from './useImageSlideshow';
import { GenerativeImageURLContainer, ImageURLHeading, ImageContainer, ImageStyle } from './styles';
import { Colors, Headline, MOBILE_BREAKPOINT, HUGE_BREAKPOINT, BaseContainer } from '../../styles/global';
import DiscordIMG from '../../assets/icons/discord_logo1.svg' // Corrected the path to the discord image
import debug from 'debug';
import { ServerLoadAndGenerationInfo } from './ServerLoadAndGenerationInfo';

const log = debug("GenerativeImageFeed")

export function GenerativeImageFeed() {
  const [serverLoad, setServerLoad] = useState(0);
  const [tabValue, setTabValue] = useState(0);
  const { image: slideshowImage, onNewImage, stop } = useImageSlideshow();
  const { updateImage, isWaiting, image, isLoading } = useImageEditor({ stop, image: slideshowImage });
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


  const gridItemSize = window.innerWidth > parseInt(MOBILE_BREAKPOINT) ? 6 : 12;

  // const latestImage = image.imageURL ? image : slideshowImage; 

  // useEffect(() => {
  //   log("latestImage", latestImage);
  // }, latestImage);

  return (
    <GenerativeImageURLContainer style={{ paddingBottom: window.innerWidth <= parseInt(MOBILE_BREAKPOINT) ? '3em' : '0' }}>
      <Grid item xs={12}>
        <ImageURLHeading>Image Feed</ImageURLHeading>
      </Grid>
      <Grid item xs={12}>
        <Typography variant="h6" color="primary" style={{ textAlign: 'center', margin: '20px 0' }}>
          Model "Flux" is now available!
        </Typography>
      </Grid>
      {!image["imageURL"] ? (
        <Grid container justify="center" alignItems="center" style={{ marginBottom: "8em" }}>
          <CircularProgress color={'inherit'} style={{ color: Colors.offwhite }} />
        </Grid>
      ) : (
        <Grid container spacing={4}>
          <Grid item xs={gridItemSize}>
            <ServerLoadAndGenerationInfo {...{ serverLoad, imagesGenerated, image }} />
            <ImageContainer style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {image ? (<>
                <Link href={image["imageURL"]} target="_blank" rel="noopener noreferrer">
                  <ImageStyle
                    src={image["imageURL"]}
                    alt="generative_image"
                  />
                </Link>
                <Typography variant="caption" color="textSecondary" style={{ marginTop: '10px', textAlign: 'center' }}>
                  Model: <Link href="https://civitai.com/models/413466/boltning-realistic-lightning-hyper" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>Boltning</Link>
                  &nbsp;&nbsp;
                  LoRA: <Link href="https://huggingface.co/tianweiy/DMD2" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>DMD2</Link>
                  &nbsp;&nbsp;
                  Prompt Pimper: <Link href="https://github.com/pollinations/pollinations/blob/master/image_gen_server/groqPimp.js" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>Groq</Link>
                </Typography>
              </>
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
              {tabValue === 0 && <ImageData {...{ image, handleParamChange, isLoading }} />}
              {tabValue === 1 && <CodeExamples {...image} />}
              {(isWaiting || isLoading) && (
                <Box display="flex" flexDirection="column" alignItems="center" margin="30px auto">
                  <CircularProgress color={'inherit'} style={{ color: isWaiting ? Colors.white : Colors.lime }} />
                  <Typography style={{ color: isWaiting ? Colors.white : Colors.lime, marginTop: '10px' }}>
                    {isWaiting ? `Waiting ${isWaiting}...` : 'Generating...'}
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



function ImageData({ image, handleParamChange, isLoading }) {


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
                <TextareaAutosize
                  minRows={3}
                  style={{ width: '100%', backgroundColor: 'transparent', color: Colors.white, padding: '10px' }}
                  value={prompt}
                  onChange={(e) => handleParamChange('prompt', e.target.value)}
                  disabled={isLoading}
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
                  style={{ marginTop: "30px", color: Colors.white }}
                  ThumbComponent={props => <span {...props} style={{ ...props.style, backgroundColor: Colors.lime }} />}
                  disabled={isLoading}
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
                  ThumbComponent={props => <span {...props} style={{ ...props.style, backgroundColor: Colors.lime }} />}
                  disabled={isLoading}
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
                  }}
                  disabled={isLoading}
                />
              </TableCell>
            </TableRow>
            <TableRow key="nofeed" style={{ borderBottom: 'none' }}>
              <TableCell align="left" component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>
                private
                <Tooltip title="Activating 'private' prevents images from appearing in the feed." style={{ color: Colors.lime }}>
                  <IconButton size="small">
                    <InfoIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
              <TableCell align="left" style={{ borderBottom: 'none', display: 'flex', alignItems: 'center' }}>
                <Checkbox
                  checked={nofeed}
                  onChange={(e) => handleParamChange('nofeed', e.target.checked)}
                  disabled={isLoading}
                />
              </TableCell>
            </TableRow>
            <TableRow key="nologo" style={{ borderBottom: 'none' }}>
              <TableCell align="left" component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>
                nologo
                <Tooltip title={<span>Hide the pollinations.ai logo. Get the password in Pollinations' Discord community. <Link href="https://discord.gg/k9F7SyTgqn" target="_blank" style={{ color: Colors.lime }}>Join here</Link></span>} interactive style={{ color: Colors.lime }}>
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
                  }}
                  disabled={isLoading}
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}

