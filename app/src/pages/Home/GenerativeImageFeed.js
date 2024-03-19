import { useState, useEffect, useCallback } from 'react';
import { Typography, Link, Box, Paper, Table, TableBody, TableCell, TableRow, TextField, CircularProgress, Slider, TableContainer } from  '@material-ui/core';
import { debounce } from 'lodash';
import { CodeExamples } from './CodeExamples';
import { useFeedLoader } from './useFeedLoader';
import { useImageSlideshow } from './useImageSlideshow';
import { GenerativeImageURLContainer, ImageURLHeading, ImageContainer, ImageStyle } from './styles';
import { shorten } from './shorten';

export function GenerativeImageFeed() {
  // const [overrideImage, setOverrideImage] = useState({});

  const { image, updateImage, isLoading, onNewImage } = useImageSlideshow();
  const { serverLoad, imagesGenerated } = useFeedLoader(onNewImage);


  const handleParamChange = (param, value) => {
    let newValue = value;
    if (param === 'seed') {
      newValue = parseInt(value, 10);
    }
    const newImage = {
      ...image,
      [param]: newValue,
    };
    const imageURL = `https://pollinations.ai/p/${encodeURIComponent(newImage.prompt)}?width=${newImage.width}&height=${newImage.height}${newImage.seed ? `&seed=${newImage.seed}` : ''}&nofeed=true`
    updateImage({
      ...newImage,
      imageURL
    });
  };

  return (
    <Box>
      <GenerativeImageURLContainer>
        <ImageURLHeading>Image Feed</ImageURLHeading>
        <ImageContainer style={{ display: 'flex', justifyContent: 'center' }}>
          {image ? (
            <Box maxWidth="600px">
            <ServerLoadAndGenerationInfo {...{serverLoad, imagesGenerated}} />
            <Link href={image["imageURL"]} target="_blank" rel="noopener noreferrer">
              <ImageStyle
                src={image["imageURL"]}
                alt="generative_image"
              />
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

function ImageData({ image, handleParamChange }) {
  const { prompt, width, height, seed, imageURL } = image;
  if (!imageURL) {
    return <Typography variant="body2" color="textSecondary">Loading...</Typography>;
  }
  return <Box style={{ width: "600px", position: "relative" }}>
    <TableContainer component={Paper} style={{ border: 'none', boxShadow: 'none' }}>
      <Table aria-label="image info table" size="small" style={{ borderCollapse: 'collapse' }}>
        <TableBody>
          {Object.entries({prompt, seed}).map(([key, value]) => (
            <TableRow key={key} style={{ borderBottom: 'none' }}>
              <TableCell component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>{key}</TableCell>
              <TableCell align="right" style={{ borderBottom: 'none' }}>
                <TextField
                  fullWidth
                  variant="outlined"
                  value={value}
                  onChange={(e) => handleParamChange(key, e.target.value)}
                  onFocus={() => handleParamChange(key, value)}
                  type={key === 'seed' ? 'number' : 'text'}
                />
              </TableCell>
            </TableRow>
          ))}
          <TableRow key="width" style={{ borderBottom: 'none' }}>
            <TableCell component="th" scope="row" style={{ borderBottom: 'none', width: '20%' }}>width</TableCell>
            <TableCell align="right" style={{ borderBottom: 'none' }}>
              <Slider
                value={width || 1024}
                onChange={(e, newValue) => handleParamChange('width', newValue)}
                aria-labelledby="width-slider"
                valueLabelDisplay="on"
                step={1}
                marks
                min={16}
                max={2048}
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
                step={1}
                marks
                min={16}
                max={2048}
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
