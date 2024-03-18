import { useState, useEffect, useCallback } from 'react';
import { Typography, Link, Box, Grid, Paper, Table, TableBody, TableCell, TableContainer, TableRow, TextField, CircularProgress } from  '@material-ui/core';
import { debounce } from 'lodash';
import { CodeExamples } from './CodeExamples';
import { useFeedLoader } from './useFeedLoader';
import { useImageSlideshow } from './useImageSlideshow';
import { GenerativeImageURLContainer, ImageURLHeading, ImageContainer, ImageStyle } from './styles';

export function GenerativeImageFeed() {
  const { image, nextPrompt, updateImage, isLoading, onNewImage } = useImageSlideshow();
  const { queuedImages, serverLoad, imagesGenerated } = useFeedLoader(onNewImage);
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    setPrompt(nextPrompt);
  }, [nextPrompt]);


  useEffect(() => {
    if (prompt) {
      updateImage({
        imageURL:`https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=1080&height=720&nofeed=true&nologo=true`
      });
    }
  }, [prompt, updateImage]);

  return (
    <Box>
      <GenerativeImageURLContainer>
        <ImageURLHeading>Image Feed</ImageURLHeading>
        <ImageContainer>
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
        {isLoading && <CircularProgress color="secondary" />}
        </ImageContainer>
        <ImageData {...{prompt, setPrompt, image, imagesGenerated, serverLoad}} />
        <br />
        <CodeExamples {...image } />
        <br />
        <Link href={`https://pollinations.ai/p/${encodeURIComponent(nextPrompt)}?width=1080&height=720&nofeed=true&nologo=true`} underline="none">Generate Image</Link>
      </GenerativeImageURLContainer>
    </Box>
  );
}

const shorten = (str) => str.length > 60 ? str.slice(0, 60) + "..." : str;

function ImageData({ prompt, setPrompt, image, imagesGenerated, serverLoad }) {
  return <Box style={{ width: "600px", position: "relative" }}>
    <TableContainer component={Paper}>
      <Table aria-label="image info table" size="small">
        <TableBody>
          <TableRow>
            <TableCell component="th" scope="row">Prompt</TableCell>
            <TableCell align="right">
              <TextField
                fullWidth
                variant="outlined"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell component="th" scope="row">Link</TableCell>
            <TableCell align="right">
              {image ? (
                <Link href={image["imageURL"]} target="_blank" rel="noopener noreferrer" style={{ color: 'deepSkyBlue' }}>
                  {shorten(image["imageURL"])}
                </Link>
              ) : (
                <Typography color="textSecondary">No image loaded</Typography>
              )}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell component="th" scope="row">Dimensions</TableCell>
            <TableCell align="right">{image ? `${image.width}x${image.height}, Seed: ${image.seed}` : 'N/A'}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell component="th" scope="row">Model</TableCell>
            <TableCell align="right">{image ? image.model : 'N/A'}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell component="th" scope="row">Generations</TableCell>
            <TableCell align="right">
              <ServerLoadDisplay concurrentRequests={serverLoad} />, &nbsp;&nbsp;
              <Typography variant="body1" component="span" style={{ fontWeight: 'bold', color: 'deepSkyBlue' }}>
                # {formatImagesGenerated(imagesGenerated)}
              </Typography>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  </Box>;
}

function ServerLoadDisplay({ concurrentRequests }) {
  concurrentRequests = Math.round(concurrentRequests/2);
  const max = 5;
  const load = Math.min(max, concurrentRequests);
  const loadDisplay = "▁▃▅▇▉".slice(1, load + 2);

  return <>Load: {loadDisplay}</>;
}

const formatImagesGenerated = (num) => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};


