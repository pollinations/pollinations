import { useState, useEffect, useCallback } from 'react';
import { Typography, Link, Box, Paper, Table, TableBody, TableCell, TableRow, TextField, CircularProgress, Slider, TableContainer, Checkbox, FormControlLabel } from  '@material-ui/core';
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
    updateImage(newImage);
  };

  const togglePrivate = (value) => {
    updateImage({
      ...image,
      isPrivate: value,
    });
  };

  const generateImageURL = () => {
    const { prompt, width, height, seed, isPrivate } = image;
    return `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=${width}&height=${height}${seed ? `&seed=${seed}` : ''}${isPrivate ? '&nofeed=true' : ''}`;
  };

  useEffect(() => {
    if (image.prompt) { // Ensure there's a prompt to generate the URL
      const imageURL = generateImageURL();
      updateImage({ ...image, imageURL });
    }
  }, [image.prompt, image.width, image.height, image.seed, image.isPrivate]); // Regenerate URL on any of these changes

  return (
    <Box>
      <GenerativeImageURLContainer>
        <ImageURLHeading>Image Feed</ImageURLHeading>
        <ImageContainer style={{ display: 'flex', justifyContent: 'center' }}>
          {image.imageURL ? (
            <Box maxWidth="500px" marginBottom="50px">
            <ServerLoadAndGenerationInfo {...{serverLoad, imagesGenerated}} />
            <Link href={image.imageURL} target="_blank" rel="noopener noreferrer">
              <ImageStyle
                src={image.imageURL}
                alt="generative_image"
              />
    
            </Link>

            </Box>
          ) : (
            <Typography variant="h6" color="textSecondary">Loading image...</Typography>
          )}
        {isLoading && <CircularProgress color="secondary" />}
        </ImageContainer>
        <ImageData {...{image, handleParamChange, togglePrivate}} />
        <br />
        <CodeExamples {...image } />
      </GenerativeImageURLContainer>
    </Box>
  );
}

function ImageData({ image, handleParamChange, togglePrivate }) {
  const { prompt, width, height, seed, isPrivate } = image;
  return <Box style={{ width: "600px", position: "relative" }}>
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
                type="text"
              />
            </TableCell>
          </TableRow>
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
                type="number"
                style={{width:"25%"}}
              />
            </TableCell>
          </TableRow>
          <TableRow key="isPrivate" style={{ borderBottom: 'none' }}>
            <TableCell component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>Private</TableCell>
            <TableCell align="right" style={{ borderBottom: 'none' }}>
              <Checkbox
                checked={isPrivate || false}
                onChange={(e) => togglePrivate(e.target.checked)}
                color="primary"
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  </Box>;
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
