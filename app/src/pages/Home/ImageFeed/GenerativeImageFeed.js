import { useState, useEffect, useRef } from "react"
import {
  Typography,
  Grid,
  Box,
  CircularProgress,
  useMediaQuery,
  Button,
  IconButton,
} from "@material-ui/core"
import { PlayArrow, Pause } from "@material-ui/icons"
import { CodeExamples } from "../CodeExamples"
import { useFeedLoader } from "./useFeedLoader"
import { useImageEditor, useImageSlideshow } from "./useImageSlideshow"
import { GenerativeImageURLContainer, ImageURLHeading } from "../styles"
import debug from "debug"
import { ServerLoadAndGenerationInfo } from "./ServerLoadAndGenerationInfo"
import { ImageEditor } from "./ImageEditor"
import { ImageDisplay } from "./ImageDisplay"
import { Colors, MOBILE_BREAKPOINT } from "../../../styles/global"

const log = debug("GenerativeImageFeed")

export function GenerativeImageFeed() {
  const [lastImage, setLastImage] = useState(null)
  const [imageParams, setImageParams] = useState({})
  const imageParamsRef = useRef(imageParams)
  const {
    image: slideshowImage,
    onNewImage,
    stop,
    isPlaying,
  } = useImageSlideshow()
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

  const handleParamChange = (param, value) => {
    setIsInputChanged(true)
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

  const handleFocus = () => {
    // No tab switching needed
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(image["imageURL"])
  }

  const handlePlayPauseClick = () => {
    stop(!isPlaying)
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
              <IconButton
                onClick={handlePlayPauseClick}
                disabled={isLoading}
                style={{ marginRight: "2em" }}
              >
                {!isPlaying ? (
                  <Pause style={{ color: 'red', fontSize: "3rem" }} />
                ) : (
                  <PlayArrow style={{ color: Colors.lime, fontSize: "3rem" }} />
                )}
              </IconButton>
              {ImagineButton(handleButtonClick, isLoading, isInputChanged)}
              {isLoading && <CircularProgress color={"inherit"} style={{ color: Colors.lime }} />}
            </Box>
          </Grid>
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
        </Grid>
      )}
    </GenerativeImageURLContainer>
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
        backgroundColor: isInputChanged ? null : Colors.lime,
        color: isInputChanged ? null : Colors.offblack,
        display: isLoading ? "none" : "block",
        fontSize: "1.5rem",
        fontFamily: "Uncut-Sans-Variable",
        fontStyle: "normal",
        fontWeight: 400,
      }}
    >
      {isInputChanged ? "Imagine" : "Re-Imagine"}
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