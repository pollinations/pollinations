import { useState, useEffect, useRef } from "react"
import {
  Grid,
  Box,
  CircularProgress,
  useMediaQuery,
  Button,
  IconButton,
  Typography,
  TextareaAutosize,
} from "@material-ui/core"
import { FileCopy as FileCopyIcon } from "@material-ui/icons"
import { CodeExamples } from "../CodeExamples"
import { useFeedLoader } from "./useFeedLoader"
import { useImageEditor, useImageSlideshow } from "./useImageSlideshow"
import {
  GenerativeImageURLContainer,
  ImageURLHeading,
  ImageContainer,
  ImageStyle,
} from "../ImageHeading"
import debug from "debug"
import { ServerLoadAndGenerationInfo } from "./ServerLoadAndGenerationInfo"
import { Colors, MOBILE_BREAKPOINT } from "../../../styles/global"
import ToggleButton from "@mui/material/ToggleButton"
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import transitions from "@material-ui/core/styles/transitions"
import { ModelInfo } from "./ModelInfo"
import { ImageEditor } from "./ImageEditor" // Added import for ImageEditor
import { CustomTooltip } from '../../../components/CustomTooltip';

const log = debug("GenerativeImageFeed")

export function GenerativeImageFeed() {
  const [lastImage, setLastImage] = useState(null)
  const [imageParams, setImageParams] = useState({})
  const imageParamsRef = useRef(imageParams)
  const { image: slideshowImage, onNewImage, stop, isStopped } = useImageSlideshow()
  const { updateImage, image, isLoading } = useImageEditor({ stop, image: slideshowImage })
  const { imagesGenerated } = useFeedLoader(onNewImage, setLastImage)
  const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT})`)
  const [isInputChanged, setIsInputChanged] = useState(false)

  useEffect(() => {
    setImageParams(image)
  }, [image])

  useEffect(() => {
    stop(false)
  }, [])

  useEffect(() => {
    imageParamsRef.current = imageParams
  }, [imageParams])

  useEffect(() => {
    setIsInputChanged(false)
  }, [image.imageURL])

  useEffect(() => {
    setToggleValue(isStopped ? "edit" : "feed")
  }, [isStopped])

  const handleParamChange = (param, value) => {
    setIsInputChanged(true)
    if (!isStopped) {
      stop(true)
    }
    setImageParams((prevParams) => ({
      ...prevParams,
      [param]: value,
    }))
  }

  const handleSubmit = () => {
    const currentImageParams = imageParamsRef.current
    const imageURL = getImageURL(currentImageParams)
    console.log("Submitting with imageParams:", currentImageParams)
    updateImage({
      ...currentImageParams,
      imageURL,
    })
  }

  const handleButtonClick = () => {
    if (!isInputChanged) {
      setImageParams((prevParams) => ({
        ...prevParams,
        seed: (prevParams.seed || 0) + 1,
      }))
    }
    setTimeout(handleSubmit, 250)
  }

  const [toggleValue, setToggleValue] = useState("feed")

  const handleToggleChange = (event, newValue) => {
    if (newValue !== null) {
      setToggleValue(newValue)
      if (newValue === "feed") {
        stop(false) // Resume the feed
      } else if (newValue === "edit") {
        stop(true) // Pause the feed
      }
    }
  }

  const handleFocus = () => {
    // No tab switching needed
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(image["imageURL"])
  }

  return (
    <GenerativeImageURLContainer style={{ margin: "3em 0 6em 0", maxWidth: "800px" }}>
      <Grid item style={{ margin: "3em 0" }}>
        <ImageURLHeading
          customPrompt={`an image with the text "Image Feed" displayed in an elegant, decorative serif font. The font has high contrast between thick and thin strokes, that give the text a sophisticated and stylized appearance. The text is in white, set against a solid black background, creating a striking and bold visual contrast. Incorporate elements related to pollinations, digital circuitry, such as flowers, chips, insects, wafers, and other organic forms into the design of the font. Each letter features unique, creative touches that make the typography stand out. Incorporate colorful elements related to pollinators and pollens, insects and plants into the design of the font. Make it very colorful with vibrant hues and gradients.`}
        >
          Image Feed
        </ImageURLHeading>
      </Grid>
      {!image["imageURL"] ? (
        <LoadingIndicator />
      ) : (
        <Grid container spacing={4} direction="column">
          <Grid item xs={12}>
            <ServerLoadAndGenerationInfo {...{ lastImage, imagesGenerated, image }} />
            <ImageDisplay
              image={image}
              isMobile={isMobile}
              handleCopyLink={handleCopyLink}
              isLoading={isLoading}
            />
          </Grid>
          <Grid item xs={12}>
            <Box display="flex" justifyContent="center" alignItems="center">
              {EditModeButton(toggleValue, handleToggleChange, isLoading)}
            </Box>
          </Grid>
          <Grid item xs={12}>
            {!isMobile && toggleValue === "feed" && (
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                width="100%"
                marginBottom="1em"
              >
                <ModelInfo
                  model={image["model"]}
                  wasPimped={image["wasPimped"]}
                  referrer={image["referrer"]}
                />
                {CopyImageLink(handleCopyLink, isLoading)}
              </Box>
            )}
            <Box display="flex" alignItems="center">
              {TextPrompt(imageParams, handleParamChange, handleFocus, isLoading)}
            </Box>
          </Grid>
          {toggleValue === "edit" && (
            <Grid item xs={12}>
              <ImageEditor
                image={imageParams}
                handleParamChange={handleParamChange}
                handleFocus={handleFocus}
                isLoading={isLoading}
                handleSubmit={handleSubmit}
                setIsInputChanged={setIsInputChanged}
              />
              <Grid item xs={12}>
                {ImagineButton(handleButtonClick, isLoading, isInputChanged)}
              </Grid>
              <Grid item xs={12}>
                <CodeExamples {...image} />
              </Grid>
            </Grid>
          )}
        </Grid>
      )}
    </GenerativeImageURLContainer>
  )
}

function CopyImageLink(handleCopyLink, isLoading) {
  return (
    <CustomTooltip title="Copy image link">
      <IconButton onClick={handleCopyLink} disabled={isLoading} style={{ marginLeft: "0.5em" }}>
        <FileCopyIcon style={{ color: Colors.lime, fontSize: "1.5rem" }} />
      </IconButton>
    </CustomTooltip>
  )
}

function TextPrompt(imageParams, handleParamChange, handleFocus, isLoading) {
  return (
    <Grid item xs={12}>
      <Typography variant="body2" color="textSecondary">
        Prompt
      </Typography>
      <TextareaAutosize
        style={{
          width: "100%",
          height: "100px",
          backgroundColor: "transparent",
          border: `0.1px solid #4A4A4A`,
          borderRadius: "5px",
          color: Colors.offwhite,
          padding: "10px",
          fontSize: "1.1rem",
          overflow: "auto",
          scrollbarWidth: "none", // For Firefox
          msOverflowStyle: "none", // For Internet Explorer and Edge
        }}
        value={imageParams.prompt}
        onChange={(e) => handleParamChange("prompt", e.target.value)}
        onFocus={handleFocus}
        disabled={isLoading}
      />
    </Grid>
  )
}

function EditModeButton(toggleValue, handleToggleChange, isLoading) {
  return (
    <ToggleButtonGroup
      value={toggleValue}
      variant="outlined"
      exclusive
      onChange={handleToggleChange}
      aria-label="Feed or Edit"
      style={{ height: "56px", border: `0.1px solid ${Colors.lime}` }}
    >
      <CustomTooltip title="Activate real-time generated image feed">
        <ToggleButton
          value="feed"
          disabled={isLoading}
          style={{
            backgroundColor: toggleValue === "feed" ? Colors.lime : "transparent",
            color: toggleValue === "feed" ? Colors.offblack : Colors.lime,
            fontSize: "1.3rem",
            fontFamily: "Uncut-Sans-Variable",
            fontStyle: "normal",
            fontWeight: 400,
            height: "100%",
            width: "100px",
            border: `1px solid ${Colors.lime}`,
          }}
        >
          Feed
        </ToggleButton>
      </CustomTooltip>
      <CustomTooltip title="Create a new image from the current one, this will freeze the feed">
        <ToggleButton
          value="edit"
          disabled={isLoading}
          style={{
            backgroundColor: toggleValue === "edit" ? Colors.lime : "transparent",
            color: toggleValue === "edit" ? Colors.offblack : Colors.lime,
            fontSize: "1.3rem",
            fontFamily: "Uncut-Sans-Variable",
            fontStyle: "normal",
            fontWeight: 400,
            height: "100%",
            width: "100px",
            border: `1px solid ${Colors.lime}`,
          }}
        >
          Edit
        </ToggleButton>
      </CustomTooltip>
    </ToggleButtonGroup>
  )
}

function ImagineButton(handleButtonClick, isLoading, isInputChanged) {
  return (
    <Button
      variant="contained"
      color="primary"
      onClick={handleButtonClick}
      disabled={isLoading}
      style={{
        backgroundColor: isInputChanged ? Colors.lime : Colors.lime,
        color: isInputChanged ? null : Colors.offblack,
        fontSize: "1.3rem",
        fontFamily: "Uncut-Sans-Variable",
        fontStyle: "normal",
        fontWeight: 400,
        height: "56px",
        width: "150px",
        position: "relative",
        marginTop: "2em",
        display: "block",
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      {isLoading ? <span></span> : "Pollinate"}
      {isLoading && (
        <CircularProgress
          size={24}
          style={{
            color: "black",
            position: "absolute",
            top: "50%",
            left: "50%",
            marginTop: -12,
            marginLeft: -12,
          }}
        />
      )}
    </Button>
  )
}

function getImageURL(newImage) {
  let imageURL = `https://pollinations.ai/p/${encodeURIComponent(newImage.prompt)}`
  let queryParams = []
  if (newImage.width && newImage.width !== 1024 && newImage.width !== "1024")
    queryParams.push(`width=${newImage.width}`)
  if (newImage.height && newImage.height !== 1024 && newImage.height !== "1024")
    queryParams.push(`height=${newImage.height}`)
  if (newImage.seed && newImage.seed !== 42 && newImage.seed !== "42")
    queryParams.push(`seed=${newImage.seed}`)
  if (newImage.nofeed) queryParams.push(`nofeed=${newImage.nofeed}`)
  if (newImage.nologo) queryParams.push(`nologo=${newImage.nologo}`)
  if (newImage.model && newImage.model !== "turbo") queryParams.push(`model=${newImage.model}`)
  if (queryParams.length > 0) {
    imageURL += "?" + queryParams.join("&")
  }
  return imageURL
}

function LoadingIndicator() {
  return (
    <Grid container justifyContent="center" alignItems="center" style={{ marginBottom: "8em" }}>
      <CircularProgress color={"inherit"} style={{ color: Colors.offwhite }} />
    </Grid>
  )
}

function ImageDisplay({ image }) {
  return (
    <ImageContainer
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
      }}
    >
      {image ? (
        <ImageStyle src={image["imageURL"]} alt="generative_image" />
      ) : (
        <Typography variant="h6" color="textSecondary">
          Loading image...
        </Typography>
      )}
    </ImageContainer>
  )
}
