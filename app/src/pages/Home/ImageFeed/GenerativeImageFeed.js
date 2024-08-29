import { useState, useEffect } from 'react';
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
  const { image: slideshowImage, onNewImage, stop } = useImageSlideshow();
  const { updateImage, image, isLoading } = useImageEditor({ stop, image: slideshowImage });
  const { imagesGenerated } = useFeedLoader(onNewImage, setLastImage);
  const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT})`);

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
              {tabValue === 1 && <CodeExamples {...image} />}
            </Box>
          </Grid>
        </Grid>
      )}
    </GenerativeImageURLContainer>
  );
}

function ModelInfo({ model }) {

  if (model === "turbo") {
    return <Typography variant="caption" color="textSecondary" style={{ marginTop: '10px', textAlign: 'center', fontSize: '1rem' }}>
      Model: <Link href="https://civitai.com/models/413466/boltning-realistic-lightning-hyper" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>Boltning</Link>
      &nbsp;&nbsp;
      LoRA: <Link href="https://huggingface.co/tianweiy/DMD2" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>DMD2</Link>
      &nbsp;&nbsp;
      Prompt Enhancer: <Link href="https://github.com/pollinations/pollinations/blob/master/image_gen_server/groqPimp.js" target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>Groq</Link>
    </Typography>;
  }

  if (model === "flux") {
    return <Typography variant="caption" color="textSecondary" style={{ marginTop: '10px', textAlign: 'center', fontSize: '1rem' }}>
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
        {['Edit', 'Integrate'].map((label, index) => (
          <Button
            key={label}
            onClick={() => setTabValue(index)}
            variant={tabValue === index ? "contained" : "text"}
            style={{
              color: tabValue === index ? Colors.offblack : Colors.lime,
              backgroundColor: tabValue === index ? Colors.lime : "transparent",
              boxShadow: 'none',
              width: "120px",
              height: "40px",
              fontSize: "0.875rem"
            }}
          >
            {label}
          </Button>
        ))}
      </ButtonGroup>
    </Box>
  );
}