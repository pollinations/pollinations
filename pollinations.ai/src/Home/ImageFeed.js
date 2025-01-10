import React, { useState, useEffect, useRef, useContext, memo, useCallback } from "react"
import { Grid, Box, useMediaQuery, Typography, CircularProgress } from "@material-ui/core"
import { makeStyles } from "@material-ui/core/styles"
import { useFeedLoader } from "../components/useFeedLoader"
import { useImageEditor, useImageSlideshow } from "../components/useImageSlideshow"
import { GenerativeImageURLContainer } from "../components/ImageHeading"
import debug from "debug"
import { ServerLoadInfo } from "../components/ServerLoadInfo"
import { Colors, MOBILE_BREAKPOINT } from "../config/global"
import { ModelInfo } from "../components/ModelInfo"
import { ImageEditor } from "../components/ImageEditor"
import { FeedEditSwitch } from "../components/FeedEditSwitch"
import { TextPrompt } from "../components/TextPrompt"
import { ImageDisplay } from "../components/ImageDisplay"
import { ImageContext } from "../utils/ImageContext"
import { CodeExamples } from "../components/CodeExamples"
import { EmojiRephrase } from "../components/EmojiRephrase"

const log = debug("GenerativeImageFeed")

const useStyles = makeStyles((theme) => ({
  container: {
    margin: "2em 0 5em 0",
    maxWidth: "1000px",
    width: "100%",
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

export const ImageFeed = memo(() => {
  const classes = useStyles()
  const [lastImage, setLastImage] = useState(null)
  const [imageParams, setImageParams] = useState({})
  const imageParamsRef = useRef(imageParams)
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

  const switchToEditMode = () => {
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
        stop(false)
      } else if (newValue === "edit") {
        stop(true)
      }
    }
  }

  const handleFocus = () => {
    setToggleValue("edit")
    stop(true)
  }

  return (
    <>
      <Box
        style={{
          background: `linear-gradient(to bottom, ${Colors.offblack2}, ${Colors.offblack})`,
          width: "100%",
        }}
      >
        <GenerativeImageURLContainer className={classes.container}>
          <Typography
            variant="h1"
            style={{
              color: Colors.lime,
              fontSize: isMobile ? "4em" : "8em",
              fontWeight: "bold",
              textAlign: "center",
              marginTop: "0.5em",
              userSelect: "none",
              letterSpacing: "0.1em",
            }}
          >
            Live Feed
          </Typography>
          <Grid item className={classes.gridItem} style={{ marginTop: "2em", maxWidth: "750px" }}>
            <Grid item xs={12} className={classes.gridCenter} style={{ marginBottom: "2em" }}>
              <ServerLoadInfo {...{ lastImage, imagesGenerated, image }} />
            </Grid>
            <Grid item xs={12} className={classes.gridCenter}>
              <Typography
                style={{
                  color: Colors.offwhite,
                  fontSize: "1.5em",
                  maxWidth: "750px",
                  textAlign: "center",
                }}
              >
                <EmojiRephrase>
                  Real-time feed of our image API endpoint (minus the private ones). Try our models
                  pausing anytime.
                </EmojiRephrase>
              </Typography>
            </Grid>
            <Grid item xs={12} className={classes.gridCenter} style={{ marginTop: "2em" }}>
            {!image["imageURL"] ? (
            <CircularProgress color={"inherit"} style={{ color: Colors.offwhite, position: "absolute" }} />
          ) : (
              <FeedEditSwitch {...{ toggleValue, handleToggleChange, isLoading }} />
                        )}

            </Grid>
          </Grid>


            <Grid container direction="column">
              <Grid
                container
                direction="row"
                spacing={0}
                className={classes.gridCenter}
                style={{
                  backgroundColor: isMobile ? "transparent" : "rgba(0, 0, 0, 0.3)",
                  borderRadius: "20px",
                  marginTop: "2em",
                }}
              >
                <Grid
                  item
                  xs={12}
                  sm={12}
                  md={12}
                  style={{
                    marginRight: "3em",
                    marginLeft: "3em",
                    marginBottom: "0em",
                    marginTop: "1em",
                  }}
                >
                  <TextPrompt
                    {...{
                      imageParams,
                      handleParamChange,
                      handleFocus,
                      isLoading,
                      isStopped,
                      edit: isStopped,
                    }}
                    stop={stop}
                    switchToEditMode={switchToEditMode}
                  />
                  <Box style={{ height: "1em" }}></Box>
                  {toggleValue === "edit" && (
                    <ImageEditor
                      image={imageParams}
                      handleParamChange={handleParamChange}
                      handleFocus={handleFocus}
                      isLoading={isLoading}
                      setIsInputChanged={setIsInputChanged}
                      handleButtonClick={handleButtonClick}
                      isInputChanged={isInputChanged}
                    />
                  )}
                </Grid>
                <ImageDisplay image={image} isMobile={isMobile} isLoading={isLoading} />
                {toggleValue === "feed" && (
                  <Grid
                    item
                    xs={12}
                    sm={12}
                    md={12}
                    style={{
                      marginBottom: "1em",
                    }}
                  >
                    <ModelInfo model={image["model"]} wasPimped={image["wasPimped"]} />
                  </Grid>
                )}
              </Grid>
            </Grid>
        </GenerativeImageURLContainer>
      </Box>
      <Box
        style={{
          background: `linear-gradient(to bottom, ${Colors.offblack}, ${Colors.offblack2})`,
          width: "100%",
        }}
      >
        <Grid item xs={12} style={{ marginTop: "5em" }}>
          <Typography
            variant="h1"
            style={{
              color: Colors.lime,
              fontSize: isMobile ? "4em" : "8em",
              fontWeight: "bold",
              textAlign: "center",
              userSelect: "none",
              letterSpacing: "0.1em",
            }}
          >
            Integrate
          </Typography>
          <Typography
            style={{
              color: Colors.offwhite,
              fontSize: "1.5em",
              margin: "0 auto",
              marginTop: "1em",
              textAlign: "center",
              maxWidth: "750px",
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
      </Box>
    </>
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
