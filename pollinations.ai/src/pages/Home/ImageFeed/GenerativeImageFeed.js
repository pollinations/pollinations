import React, { useState, useEffect, useRef, useContext, memo, useCallback } from "react"
import { Grid, Box, useMediaQuery, Typography } from "@material-ui/core"
import { makeStyles } from "@material-ui/core/styles" // Import makeStyles
import { useFeedLoader } from "./useFeedLoader"
import { useImageEditor, useImageSlideshow } from "./useImageSlideshow"
import { GenerativeImageURLContainer, ImageURLHeading } from "../ImageHeading"
import debug from "debug"
import { ServerLoadAndGenerationInfo } from "./ServerLoadAndGenerationInfo"
import { Colors, MOBILE_BREAKPOINT } from "../../../styles/global"
import { ModelInfo } from "./ModelInfo"
import { ImageEditor } from "./ImageEditor"
import { FeedEditSwitch } from "../../../components/FeedEditSwitch"
import { ImagineButton } from "../../../components/ImagineButton"
import { TextPrompt } from "./TextPrompt"
import { LoadingIndicator } from "./LoadingIndicator"
import { ImageDisplay } from "./ImageDisplay"
import { ImageContext } from "../../../contexts/ImageContext"
import { CodeExamples } from "../CodeExamples"
import { EmojiRephrase } from "../../../components/EmojiRephrase"

const log = debug("GenerativeImageFeed")

// Define the useStyles hook
const useStyles = makeStyles((theme) => ({
  container: {
    margin: "2em 0 5em 0",
    maxWidth: "1000px",
  },
  gridItem: {
    margin: "0em 0",
  },
  boxRelative: {
    position: "relative",
  },
  boxCenter: {
    display: "flex",
    justifyContent: "center",
  },
  boxColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    bgcolor: "rgba(42, 44, 28, 0.1)",
    borderRadius: "8px",
    padding: theme.spacing(2),
    border: "none",
  },
  boxFlex: {
    display: "flex",
    alignItems: "center",
    marginLeft: theme.spacing(1.5),
    marginRight: theme.spacing(1.5),
    width: "100%",
  },
  boxMarginTop: {
    width: "100%",
    marginTop: theme.spacing(2),
  },
  gridCenter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  scaledImageURLHeading: {
    transform: "scale(1)",
    transformOrigin: "center",
    width: "100%",
    maxWidth: "100%",
  },
  boxBottom: {
    maxWidth: "100%",
    marginBottom: "500px",
  },
}))

export const GenerativeImageFeed = memo(function GenerativeImageFeed() {
  const classes = useStyles() // Use the useStyles hook
  const [lastImage, setLastImage] = useState(null)
  const [imageParams, setImageParams] = useState({})
  const imageParamsRef = useRef(imageParams) // Use useRef for imageParamsRef
  const { image: slideshowImage, onNewImage, stop, isStopped } = useImageSlideshow()
  const { updateImage, cancelLoading, image, isLoading } = useImageEditor({
    stop,
    image: slideshowImage,
  })
  const { imagesGenerated } = useFeedLoader(onNewImage, setLastImage)
  const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT})`)
  const [isInputChanged, setIsInputChanged] = useState(false)
  const { setImage } = useContext(ImageContext)
  const [toggleValue, setToggleValue] = useState("feed")

  function switchToEditMode() {
    setToggleValue("edit")
  }

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

  const handleParamChange = useCallback(
    (param, value) => {
      setIsInputChanged(true)
      if (!isStopped) {
        stop(true)
      }
      setImageParams((prevParams) => ({
        ...prevParams,
        [param]: value,
      }))
    },
    [isStopped, stop]
  )

  const handleSubmit = useCallback(() => {
    const currentImageParams = imageParamsRef.current
    const imageURL = getImageURL(currentImageParams)
    console.log("Submitting with imageParams:", currentImageParams)
    updateImage({
      ...currentImageParams,
      imageURL,
    })
  }, [updateImage])

  const handleButtonClick = () => {
    if (isLoading) {
      // Cancel the current generation
      cancelLoading()
      return
    }

    if (!isInputChanged) {
      setImageParams((prevParams) => ({
        ...prevParams,
        seed: (prevParams.seed || 0) + 1,
      }))
    }
    setTimeout(handleSubmit, 250)
  }

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
    setToggleValue("edit")
    stop(true)
  }

  return (
    <GenerativeImageURLContainer className={classes.container}>
      <Grid item className={classes.gridItem} style={{ marginTop: "2em" }}>
        <ImageURLHeading width={isMobile ? 400 : 700} height={isMobile ? 150 : 200}>
          Image Feed
        </ImageURLHeading>
        <Typography
              style={{
                color: Colors.white,
                fontSize: "1.5em",
                maxWidth: "750px",
                margin: "2em auto 2em auto",
                textAlign: "center",
              }}
            >
              <EmojiRephrase>
                Real-time feed of our image API endpoint (minus the private ones). Pause it anytime to test our models.
              </EmojiRephrase>
            </Typography>
      </Grid>
      {!image["imageURL"] ? (
        <LoadingIndicator />
      ) : (
        <Grid container spacing={0} direction="column">
          <Grid item xs={12}>
            <ServerLoadAndGenerationInfo {...{ lastImage, imagesGenerated, image }} />
            <ImageDisplay image={image} isMobile={isMobile} isLoading={isLoading} />
          </Grid>
          <Grid item xs={12} style={{ marginTop: "2em" }}>
            <Box className={classes.boxRelative}>
              <Box className={classes.boxCenter}>
                <FeedEditSwitch {...{ toggleValue, handleToggleChange, isLoading }} />
                <Box mx={2} />
                <ImagineButton {...{ handleButtonClick, isLoading, isInputChanged }} />
              </Box>
            </Box>
          </Grid>
          <Grid item xs={12}>
            <Box className={classes.boxColumn}>
              <Box className={classes.boxFlex}>
                <TextPrompt
                  {...{ imageParams, handleParamChange, handleFocus, isLoading, isStopped }}
                  stop={stop}
                  switchToEditMode={switchToEditMode}
                />
              </Box>
              {toggleValue === "edit" && (
                <Box className={classes.boxMarginTop}>
                  <ImageEditor
                    image={imageParams}
                    handleParamChange={handleParamChange}
                    handleFocus={handleFocus}
                    handleSubmit={handleSubmit}
                    setIsInputChanged={setIsInputChanged}
                  />
                </Box>
              )}
            </Box>
          </Grid>

          {toggleValue === "feed" && (
            <Grid item xs={12} className={classes.gridCenter}>
              <ModelInfo
                model={image["model"]}
                wasPimped={image["wasPimped"]}
                referrer={image["referrer"]}
              />
            </Grid>
          )}

          <Grid item xs={12} style={{ marginTop: "4em" }}>
            {/* <ImageURLHeading
              className={classes.scaledImageURLHeading}
              width={isMobile ? 400 : 700}
              height={isMobile ? 150 : 200}
              whiteText={true}
            >
              Integrate
            </ImageURLHeading> */}
            <hr style={{ border: `1px solid ${Colors.lime}`, marginBottom: "4em", marginTop: "2em" }} />
            <Typography
              style={{
                color: Colors.white,
                fontSize: "1.5em",
                maxWidth: "750px",
                margin: "0 auto",
                textAlign: "center",
              }}
            >
              <EmojiRephrase>
                Discover how to seamlessly integrate our free image and text generation API into your
                projects. Below are code examples to help you get started.
              </EmojiRephrase>
            </Typography>
            <Box style={{ marginTop: "2em", marginBottom: "4em" }}>
              <CodeExamples image={image} />
            </Box>
          </Grid>
        </Grid>
      )}
    </GenerativeImageURLContainer>
  )
})

function getImageURL(newImage) {
  let imageURL = `https://pollinations.ai/p/${encodeURIComponent(newImage.prompt)}`
  let queryParams = []
  if (newImage.width && newImage.width !== 1024 && newImage.width !== "1024")
    queryParams.push(`width=${newImage.width}`)
  if (newImage.height && newImage.height !== 1024 && newImage.height !== "1024")
    queryParams.push(`height=${newImage.height}`)
  if (newImage.seed && newImage.seed !== 42 && newImage.seed !== "42")
    queryParams.push(`seed=${newImage.seed}`)
  if (newImage.enhance) queryParams.push(`enhance=${newImage.enhance}`)
  if (newImage.nologo) queryParams.push(`nologo=${newImage.nologo}`)
  if (newImage.model) queryParams.push(`model=${newImage.model}`)
  if (queryParams.length > 0) {
    imageURL += "?" + queryParams.join("&")
  }
  return imageURL
}
