import React, { useState, useEffect, useRef, useContext } from "react"
import { Grid, Box, useMediaQuery } from "@material-ui/core"
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

export function GenerativeImageFeed() {
  const classes = useStyles() // Use the useStyles hook
  const [lastImage, setLastImage] = useState(null)
  const [imageParams, setImageParams] = useState({})
  const imageParamsRef = useRef(imageParams)
  const { image: slideshowImage, onNewImage, stop, isStopped } = useImageSlideshow()
  const { updateImage, image, isLoading } = useImageEditor({ stop, image: slideshowImage })
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
        <ImageURLHeading
          width={isMobile ? 400 : 700}
          height={isMobile ? 150 : 200}
        >
          Image Feed
        </ImageURLHeading>
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
                <Box mx={2} /> {/* Add horizontal space */}
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
                    isLoading={isLoading}
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
            {/*<ImageURLHeading
              customPrompt={`A large, detailed arrow pointing downwards on a solid black background. The arrow is adorned with colorful, intricate insects, creating a striking and bold visual contrast. Incorporate elements related to pollinators and digital circuitry, such as flowers, chips, insects, wafers, and other organic forms into the design of the arrow. Each part of the arrow features unique, creative touches that make the design stand out. Make it very colorful with vibrant hues and gradients.`}
              className={classes.scaledImageURLHeading}
              width={isMobile ? 80 : 80}
              height={isMobile ? 100 : 100}
            ></ImageURLHeading>*/}
            <ImageURLHeading
              customPrompt={`an image with the text "Integrate" displayed in an elegant, decorative serif font. The font has high contrast between thick and thin strokes, that give the text a sophisticated and stylized appearance. The text is in white, set against a solid black background, creating a striking and bold visual contrast. Incorporate elements related to pollinations, digital circuitry, such as flowers, chips, insects, wafers, and other organic forms into the design of the font. Each letter features unique, creative touches that make the typography stand out. Incorporate colorful elements related to pollinators and pollens, insects and plants into the design of the font. Make it very colorful with vibrant hues and gradients.`}
              className={classes.scaledImageURLHeading}
              width={isMobile ? 400 : 700}
              height={isMobile ? 150 : 200}
            >
              Integrations
            </ImageURLHeading>
            <Box style={{ marginTop: "2em", marginBottom: "4em" }}>
              <CodeExamples image={image} />
            </Box>
          </Grid>
        </Grid>
      )}
    </GenerativeImageURLContainer>
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
  if (newImage.model) queryParams.push(`model=${newImage.model}`)
  if (queryParams.length > 0) {
    imageURL += "?" + queryParams.join("&")
  }
  return imageURL
}

