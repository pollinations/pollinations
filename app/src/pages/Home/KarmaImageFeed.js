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
import Iframe from 'react-iframe'
const log = debug("KarmaImageFeed")

export function KarmaImageFeed() {
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
    <Iframe url="https://karma.yt"
        width="100%"
        height="700px"></Iframe>

  );
}

