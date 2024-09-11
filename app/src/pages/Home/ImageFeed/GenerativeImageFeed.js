import { useState, useEffect, useRef } from 'react';
import { Typography, ButtonGroup, Grid, Link, Box, CircularProgress, useMediaQuery, Button } from '@material-ui/core';
import { CodeExamples } from '../CodeExamples';
import { useFeedLoader } from './useFeedLoader';
import { useImageEditor, useImageSlideshow } from './useImageSlideshow';
import { GenerativeImageURLContainer, ImageURLHeading } from '../styles';

import debug from 'debug';
import { ServerLoadAndGenerationInfo } from './ServerLoadAndGenerationInfo';
import { ImageEditor } from './ImageEditor';
import { ImageDisplay } from './ImageDisplay';
import { Colors, MOBILE_BREAKPOINT } from '../../../styles/global';

const log = debug("GenerativeImageFeed");

export function GenerativeImageFeed() {
  const [lastImage, setLastImage] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const [imageParams, setImageParams] = useState({});
  const imageParamsRef = useRef(imageParams); // Create a ref to keep track of imageParams
  const { image: slideshowImage, onNewImage, stop } = useImageSlideshow();
  const { updateImage, image, isLoading } = useImageEditor({ stop, image: slideshowImage });
  const { imagesGenerated } = useFeedLoader(onNewImage, setLastImage);
  const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT})`);

  useEffect(() => {
    setImageParams(image);
  }, [image]);

  useEffect(() => {
    stop(tabValue == 1)
  }, [tabValue]);

  useEffect(() => {
    imageParamsRef.current = imageParams; // Update the ref whenever imageParams changes
  }, [imageParams]);

  const handleParamChange = (param, value) => {
    setImageParams(prevParams => ({
      ...prevParams,
      [param]: value,
    }));
  };

  const handleSubmit = () => {
    const currentImageParams = imageParamsRef.current; // Use the ref to get the latest imageParams
    const imageURL = getImageURL(currentImageParams);
    console.log("Submitting with imageParams:", currentImageParams);
    updateImage({
      ...currentImageParams,
      imageURL
    });
  };

  const handleFocus = () => {
    // stop(true); // Stop the slideshow when any form control is focused
    setTabValue(1);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(image["imageURL"]);
  };

  return (
    <GenerativeImageURLContainer style={{ paddingBottom: '3em' }}>
      <Grid item>
        <ImageURLHeading>Image Feed</ImageURLHeading>
      </Grid>
      {!image["imageURL"] ? (
        <LoadingIndicator />
      ) : (
        <Grid container spacing={4} direction="column">
          <Grid item xs={12}>
            <ServerLoadAndGenerationInfo {...{ lastImage, imagesGenerated, image }} />
            <ImageDisplay image={image} isMobile={isMobile} handleCopyLink={handleCopyLink} />
          </Grid>
          <Grid item xs={12}>
            {!isMobile && <TabSelector tabValue={tabValue} setTabValue={setTabValue} />}
            <Box>
              {tabValue === 0 && (
                <ImageEditor
                  image={imageParams}
                  handleParamChange={handleParamChange}
                  handleFocus={handleFocus}
                  isLoading={isLoading}
                  handleSubmit={handleSubmit}
                />
              )}
              {tabValue === 1 && (
                <ImageEditor
                  image={imageParams}
                  handleParamChange={handleParamChange}
                  handleFocus={handleFocus}
                  isLoading={isLoading}
                  handleSubmit={handleSubmit}
                />
              )}
              {tabValue === 2 && <CodeExamples {...image} />}
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
  if (newImage.model && newImage.model !== "turbo") queryParams.push(`model=${newImage.model}`);

  if (queryParams.length > 0) {
    imageURL += '?' + queryParams.join('&');
  }

  return imageURL;
}

function LoadingIndicator() {
  return (
    <Grid container justify="center" alignItems="center" style={{ marginBottom: "8em" }}>
      <CircularProgress color={'inherit'} style={{ color: Colors.offwhite }} />
    </Grid>
  );
}

function TabSelector({ tabValue, setTabValue }) {
  return (
    <Box display="flex" justifyContent="center">
      <ButtonGroup aria-label="edit-integrate-button-group" style={{ border: 'none' }}>

        {['Feed', 'Edit', 'Integrate'].map((label, index) => (
          <Button
            key={label}
            onClick={() => setTabValue(index)}
            className={index === 0 ? 'feed-button' : (tabValue !== 0 ? 'feed-button-off' : null)}
            variant={tabValue === index ? "contained" : "text"}
            style={{
              color: tabValue === index ? Colors.offblack : Colors.lime,
              backgroundColor: tabValue === index ? Colors.lime : "transparent",
              boxShadow: 'none',
              width: "120px",
              height: "40px",
              fontSize: "0.875rem"
            }}
          >{label}
          </Button>
        ))}
      </ButtonGroup>
    </Box>
  );
}