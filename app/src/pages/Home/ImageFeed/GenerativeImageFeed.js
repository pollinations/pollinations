import { useState, useEffect, useRef } from "react"
import { Grid, Box, useMediaQuery } from "@material-ui/core"
import { CodeExamples } from "../CodeExamples"
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
    setToggleValue("edit")
    stop(true)
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
          <Grid item xs={12} >
            <ServerLoadAndGenerationInfo {...{ lastImage, imagesGenerated, image }} />
            <ImageDisplay
              image={image}
              isMobile={isMobile}
              isLoading={isLoading}
            />
          </Grid>
          <Grid item xs={12}>
            <Box position="relative" maxWidth="800px" margin="0 auto" marginBottom={2}>
              <Box display="flex" justifyContent="center">
                <FeedEditSwitch {...{ toggleValue, handleToggleChange, isLoading }} />
              </Box>
              <Box position="absolute" right={0} top="50%" style={{ transform: 'translateY(-50%)' }}>
                <ImagineButton {...{ handleButtonClick, isLoading, isInputChanged }} />
              </Box>
            </Box>
          </Grid>
          <Grid item xs={12}>
            <Box display="flex" alignItems="center">
              <TextPrompt {...{ imageParams, handleParamChange, handleFocus, isLoading, isStopped }} />
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
            </Grid>
          )}
          {toggleValue === "feed" && (
            <Grid item xs={12} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ModelInfo
                model={image["model"]}
                wasPimped={image["wasPimped"]}
                referrer={image["referrer"]}
              />
            </Grid>
          )}
          <Grid item xs={12}>
            <CodeExamples {...image} />
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
  if (newImage.model && newImage.model !== "turbo") queryParams.push(`model=${newImage.model}`)
  if (queryParams.length > 0) {
    imageURL += "?" + queryParams.join("&")
  }
  return imageURL
}
