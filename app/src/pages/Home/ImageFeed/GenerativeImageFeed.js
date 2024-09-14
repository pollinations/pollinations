import { useState, useEffect, useRef } from 'react';
import { Typography, Grid, Box, CircularProgress, useMediaQuery, Button, AppBar, Tabs, Tab } from '@material-ui/core';
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
  const imageParamsRef = useRef(imageParams);
  const { image: slideshowImage, onNewImage, stop } = useImageSlideshow();
  const { updateImage, image, isLoading } = useImageEditor({ stop, image: slideshowImage });
  const { imagesGenerated } = useFeedLoader(onNewImage, setLastImage);
  const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT})`);
  const [isInputChanged, setIsInputChanged] = useState(false);

  useEffect(() => {
    setImageParams(image);
  }, [image]);

  useEffect(() => {
    stop(tabValue === 1);
  }, [tabValue]);

  useEffect(() => {
    imageParamsRef.current = imageParams;
  }, [imageParams]);

  useEffect(() => {
    setIsInputChanged(false);
  }, [image.imageURL]);

  const handleParamChange = (param, value) => {
    setIsInputChanged(true);
    setImageParams(prevParams => ({
      ...prevParams,
      [param]: value,
    }));
  };

  const handleSubmit = () => {
    const currentImageParams = imageParamsRef.current;
    const imageURL = getImageURL(currentImageParams);
    console.log("Submitting with imageParams:", currentImageParams);
    updateImage({
      ...currentImageParams,
      imageURL
    });
  };

  const handleButtonClick = () => {
    if (!isInputChanged) {
      setImageParams(prevParams => ({
        ...prevParams,
        seed: (prevParams.seed || 0) + 1,
      }));
    }
    setTimeout(handleSubmit, 250);
  };

  const handleFocus = () => {
    setTabValue(1);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(image["imageURL"]);
  };

  return (
    <GenerativeImageURLContainer style={{ paddingBottom: '3em' }}>
      <Grid item style={{ margin: '3em 0' }}>
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
            <TabSelector tabValue={tabValue} setTabValue={setTabValue} />
            <Box>
              {tabValue === 0 && (
                <Box>
                  {/* This tab is intentionally left empty */}
                </Box>
              )}
              {tabValue === 1 && (
                <ImageEditor
                  image={imageParams}
                  handleParamChange={handleParamChange}
                  handleFocus={handleFocus}
                  isLoading={isLoading}
                  handleSubmit={handleSubmit}
                  setIsInputChanged={setIsInputChanged}
                />
              )}
              {tabValue === 2 && <CodeExamples {...image} />}
            </Box>
          </Grid>
          <Grid item xs={12}>
            <Box display="flex" justifyContent="center">
              {ImagineButton(handleButtonClick, isLoading, isInputChanged)}
              {isLoading && <CircularProgress color={'inherit'} style={{ color: Colors.lime }} />}
            </Box>
          </Grid>
        </Grid>
      )}
    </GenerativeImageURLContainer>
  );
}

function ImagineButton(handleButtonClick, isLoading, isInputChanged) {
  return <Button
    variant="contained"
    color="primary"
    onClick={handleButtonClick}
    disabled={isLoading}
    style={{
      backgroundColor: isInputChanged ? null : Colors.lime,
      color: isInputChanged ? null : Colors.offblack,
      display: isLoading ? 'none' : 'block',
      fontSize: "1.5rem",
      fontFamily: "Uncut-Sans-Variable",
      fontStyle: "normal",
      fontWeight: 400
    }}
  >
    {isInputChanged ? 'Imagine' : 'Re-Imagine'}
  </Button>;
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
    <Grid container justifyContent="center" alignItems="center" style={{ marginBottom: "8em" }}>
      <CircularProgress color={'inherit'} style={{ color: Colors.offwhite }} />
    </Grid>
  );
}

function TabSelector({ tabValue, setTabValue }) {
  return (
    <AppBar position="static" style={{ color: "white", width: "auto", boxShadow: 'none' }}>
      <Box display="flex" justifyContent="center">
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} aria-label="simple tabs example" variant="scrollable" scrollButtons="on" TabIndicatorProps={{ style: { background: Colors.lime } }} >
          {['Feed', 'Edit', 'Integrate'].map((label, index) => (
            <Tab
              key={label}
              label={label}
              style={{
                color: tabValue === index ? Colors.lime : Colors.offwhite,
                backgroundColor: tabValue === index ? "transparent" : "transparent",
                boxShadow: 'none',
                width: "200px",
                fontSize: "1.5rem",
                fontFamily: "Uncut-Sans-Variable",
                fontStyle: "normal",
                fontWeight: 400,
                borderRadius: 0
              }}
            />
          ))}
        </Tabs>
      </Box>
    </AppBar>
  );
}