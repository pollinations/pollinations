import { useState, useEffect, useCallback } from 'react';
import { Typography, Link, Box, Paper, Table, TableBody, TableCell, TableRow, TextField, CircularProgress, Slider, TableContainer, Checkbox, Tooltip, IconButton, Collapse, Button } from  '@material-ui/core';
import InfoIcon from '@material-ui/icons/Info';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { debounce } from 'lodash';
import { CodeExamples } from './CodeExamples';
import { useFeedLoader } from './useFeedLoader';
import { useImageSlideshow } from './useImageSlideshow';
import { GenerativeImageURLContainer, ImageURLHeading, ImageContainer, ImageStyle } from './styles';
import { shorten } from './shorten';

export function GenerativeImageFeed() {
  const [ serverLoad, setServerLoad] = useState(0);

  const { image, updateImage, isLoading, onNewImage } = useImageSlideshow(serverLoad);
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


  if (!image["imageURL"])
    return <>Initializing...</>;

  return (
    <Box>
      <GenerativeImageURLContainer>
        <ImageURLHeading>Image Feed</ImageURLHeading>
        <ImageContainer style={{ display: 'flex', justifyContent: 'center' }}>
          {image ? (
            <Box maxWidth="500px" marginBottom="50px">
              <ServerLoadAndGenerationInfo {...{serverLoad, imagesGenerated}} />
              <Link href={image["imageURL"]} target="_blank" rel="noopener noreferrer">
                <ImageStyle
                  src={image["imageURL"]}
                  alt="generative_image"
                />
                <br />
                <TimingInfo image={image} />
              </Link>
            </Box>
          ) : (
            <Typography variant="h6" color="textSecondary">Loading image...</Typography>
          )}
          {isLoading && <CircularProgress color="secondary" />}
        </ImageContainer>
        <ImageData {...{image, handleParamChange}} />
        <br />
        <CodeExamples {...image } />
      </GenerativeImageURLContainer>
    </Box>
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

function TimingInfo({image}) {
  const timeMs = image?.timingInfo?.[5].timestamp;
  return <Box textAlign="right"><Typography variant="body2" component="i">{Math.round(timeMs/10)/100} s</Typography></Box>
}

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
    <Box style={{ width: "600px", position: "relative" }}>
      <TableContainer component={Paper} style={{ border: 'none', boxShadow: 'none' }}>
        <Table aria-label="image info table" size="small" style={{ borderCollapse: 'collapse' }}>
          <TableBody>
            <TableRow key="prompt" style={{ borderBottom: 'none' }}>
              <TableCell component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>prompt</TableCell>
              <TableCell align="right" style={{ borderBottom: 'none' }}>
                <TextField
                  fullWidth
                  variant="outlined"
                  value={prompt}
                  onChange={(e) => handleParamChange('prompt', e.target.value)}
                  onFocus={() => handleParamChange('prompt', prompt)}
                  type="text"
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={2} style={{ borderBottom: 'none', textAlign: 'right' }}>
                <Button onClick={toggleAdvancedOptions} endIcon={<ExpandMoreIcon />}>{advancedOptionsOpen ? 'Hide Options' : 'Show Options'}</Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
      <Collapse in={advancedOptionsOpen}>
        <TableContainer component={Paper} style={{ border: 'none', boxShadow: 'none', marginTop: '10px' }}>
          <Table aria-label="advanced options table" size="small" style={{ borderCollapse: 'collapse' }}>
            <TableBody>
              {/* Advanced Options Rows */}
              <TableRow key="width" style={{ borderBottom: 'none' }}>
                <TableCell component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>width</TableCell>
                <TableCell align="right" style={{ borderBottom: 'none' }}>
                  <Slider
                    value={width || 1024}
                    onChange={(e, newValue) => handleParamChange('width', newValue)}
                    aria-labelledby="width-slider"
                    valueLabelDisplay="on"
                    step={16}
                    marks
                    min={16}
                    max={2048}
                    style={{marginTop:"30px"}}
                  />
                </TableCell>
              </TableRow>
              <TableRow key="height" style={{ borderBottom: 'none' }}>
                <TableCell component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>height</TableCell>
                <TableCell align="right" style={{ borderBottom: 'none' }}>
                  <Slider
                    value={height || 1024}
                    onChange={(e, newValue) => handleParamChange('height', newValue)}
                    aria-labelledby="height-slider"
                    valueLabelDisplay="on"
                    step={16}
                    marks
                    min={16}
                    max={2048}
                    style={{marginTop:"30px"}}
                  />
                </TableCell>
              </TableRow>
              <TableRow key="seed" style={{ borderBottom: 'none' }}>
                <TableCell component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>seed</TableCell>
                <TableCell align="right" style={{ borderBottom: 'none' }}>
                  <TextField
                    fullWidth
                    variant="outlined"
                    value={seed}
                    onChange={(e) => handleParamChange('seed', parseInt(e.target.value))}
                    onFocus={() => handleParamChange('seed', seed)}
                    type="number"
                    style={{width:"25%"}}
                  />
                </TableCell>
              </TableRow>
              <TableRow key="nofeed" style={{ borderBottom: 'none' }}>
                <TableCell component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>
                  private
                  <Tooltip title="Activating 'private' prevents images from appearing in the feed">
                    <IconButton size="small">
                      <InfoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
                <TableCell align="right" style={{ borderBottom: 'none', display: 'flex', alignItems: 'center' }}>
                  <Checkbox
                    checked={nofeed}
                    onChange={(e) => handleParamChange('nofeed', e.target.checked)}
                    color="primary"
                  />
                </TableCell>
              </TableRow>
              <TableRow key="nologo" style={{ borderBottom: 'none' }}>
                <TableCell component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>
                  nologo
                  <Tooltip title="Hide the pollinations.ai logo. Get the password in Pollinations' Discord community.">
                    <IconButton size="small">
                      <InfoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
                <TableCell align="right" style={{ borderBottom: 'none', display: 'flex', alignItems: 'center' }}>
                  <TextField
                    type="password"
                    variant="outlined"
                    onChange={(e) => handleParamChange('nologo', e.target.value)}
                    style={{width:"25%"}}
                    value={nologo}
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Collapse>
    </Box>
  );
}

function ServerLoadAndGenerationInfo({ serverLoad, imagesGenerated }) {
  return (
    <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
      <ServerLoadDisplay concurrentRequests={serverLoad} />
      <Typography variant="body1" component="span">
        #: <b style={{color:'deepskyblue'}}>{formatImagesGenerated(imagesGenerated)}</b>
      </Typography>
    </Box>
  );
}

function ServerLoadDisplay({ concurrentRequests }) {
  concurrentRequests = Math.round(concurrentRequests/2);
  const max = 5;
  const load = Math.min(max, concurrentRequests);
  const loadDisplay = "▁▃▅▇▉".slice(1, load + 2);

  return <span>Server Load: <b style={{color:'deepskyblue'}}>{loadDisplay}</b></span>;
}

const formatImagesGenerated = (num) => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
