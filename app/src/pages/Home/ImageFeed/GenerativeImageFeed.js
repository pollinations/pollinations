import { useState, useEffect, useRef } from "react"
import {
  Tooltip,
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
import { GenerativeImageURLContainer, ImageURLHeading } from "../ImageHeading"
import debug from "debug"
import { ServerLoadAndGenerationInfo } from "./ServerLoadAndGenerationInfo"
import { ImageEditor } from "./ImageEditor"
import { ImageDisplay } from "./ImageDisplay"
import { Colors, MOBILE_BREAKPOINT } from "../../../styles/global"
import ToggleButton from "@mui/material/ToggleButton"
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import transitions from "@material-ui/core/styles/transitions"

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
    <GenerativeImageURLContainer style={{ paddingBottom: "3em", maxWidth: "800px" }}>
      <Grid item style={{ margin: "3em 0" }}>
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
            <Box display="flex" justifyContent="center" alignItems="center">
              {EditModeButton(toggleValue, handleToggleChange, isLoading)}
              {ImagineButton(handleButtonClick, isLoading, isInputChanged)}
              <Tooltip title="Copy link">
                <IconButton
                  onClick={handleCopyLink}
                  disabled={isLoading}
                  style={{ marginLeft: "2em" }}
                >
                  <FileCopyIcon style={{ color: Colors.lime, fontSize: "3rem" }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="body2" color="textSecondary">
              Prompt
            </Typography>
            <TextareaAutosize
              minRows={3}
              style={{
                width: "100%",
                height: "100px",
                backgroundColor: "transparent",
                border: `0.1px solid ${Colors.offwhite}`,
                borderRadius: "5px",
                color: Colors.offwhite,
                padding: "10px",
                fontSize: "1.1rem",
              }}
              value={imageParams.prompt}
              onChange={(e) => handleParamChange("prompt", e.target.value)}
              onFocus={handleFocus}
              disabled={isLoading}
            />
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
              <CodeExamples {...image} />
            </Grid>
          )}
        </Grid>
      )}
    </GenerativeImageURLContainer>
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
      style={{ marginRight: "2em", height: "56px", border: `0.1px solid ${Colors.lime}` }}
    >
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
    </ToggleButtonGroup>
  );
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
        position: "relative",
      }}
    >
      {isLoading ? (
        <span>
          Imagining
          <span className="dots">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </span>
      ) : isInputChanged ? "Imagine" : "Re-Imagine"}
      {isLoading && (
        <CircularProgress
          size={24}
          style={{
            color: Colors.offblack,
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
