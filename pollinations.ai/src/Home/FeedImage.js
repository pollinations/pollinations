import React, { useState, useEffect, useRef, useContext, memo, useCallback } from "react"
import { Grid, Box, useMediaQuery, CircularProgress } from "@material-ui/core"
import { useFeedLoader } from "../utils/useFeedLoader"
import { useImageEditor, useImageSlideshow } from "../utils/useImageSlideshow"
import debug from "debug"
import { ServerLoadInfo } from "../components/FeedImage/ServerLoadInfo"
import { Colors, MOBILE_BREAKPOINT } from "../config/global"
import { ModelInfo } from "../components/FeedImage/ModelInfo"
import { ImageEditor } from "../components/FeedImage/ImageEditor"
import { FeedEditSwitch } from "../components/FeedImage/FeedEditSwitch"
import { TextPrompt } from "../components/FeedImage/TextPrompt"
import { ImageDisplay } from "../components/FeedImage/ImageDisplay"
import { ImageContext } from "../utils/ImageContext"
import { SectionContainer } from "../components/SectionContainer"
import { SectionBgBox } from "../components/SectionBgBox"
import SectionTitle from "../components/SectionTitle"
import SectionSubtitle from "../components/SectionSubtitle"
import { IMAGE_FEED_SUBTITLE, IMAGE_FEED_TITLE } from "../config/copywrite"
import { getImageURL } from "../utils/getImageURL"

const log = debug("GenerativeImageFeed")

export const FeedImage = memo(() => {
  // State variables
  const [lastImage, setLastImage] = useState(null)
  const [imageParams, setImageParams] = useState({})
  const imageParamsRef = useRef(imageParams)
  const [isInputChanged, setIsInputChanged] = useState(false)
  const [toggleValue, setToggleValue] = useState("feed")

  // Hooks
  const { image: slideshowImage, onNewImage, stop, isStopped } = useImageSlideshow()
  const { updateImage, cancelLoading, image, isLoading } = useImageEditor({
    stop,
    image: slideshowImage,
  })
  const { imagesGenerated } = useFeedLoader(onNewImage, setLastImage)
  const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT})`)
  const { setImage } = useContext(ImageContext)


  // Effects
  useEffect(() => {
    setImageParams(image)
  }, [image])

  useEffect(() => {
    imageParamsRef.current = imageParams
  }, [imageParams])

  useEffect(() => {
    setIsInputChanged(false)
  }, [image?.imageURL])

  useEffect(() => {
    setToggleValue(isStopped ? "edit" : "feed")
  }, [isStopped])


  // Handlers
  const switchToEditMode = () => {
    setToggleValue("edit")
  }

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
    log("Submitting with imageParams:", currentImageParams)
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
      stop(newValue === "edit")
    }
  }

  const handleFocus = () => {
    setToggleValue("edit")
    stop(true)
  }


  return (
    <SectionContainer
      style={{
        background: `linear-gradient(to bottom, ${Colors.offblack2}, ${Colors.offblack})`,
      }}
    >
      <Grid
        style={{
          maxWidth: "750px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "2em",
          marginBottom: "2em",
        }}
      >
        <SectionTitle title={IMAGE_FEED_TITLE} />
        <ServerLoadInfo {...{ lastImage, imagesGenerated, image }} />
        <SectionSubtitle subtitle={IMAGE_FEED_SUBTITLE} />
        {image?.imageURL && (
          <FeedEditSwitch {...{ toggleValue, handleToggleChange, isLoading }} />
        )}
      </Grid>
      <SectionBgBox>
        <Box padding="15px">
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
          {toggleValue === "edit" && (
            <Box mt="1em">
              <ImageEditor
                image={imageParams}
                handleParamChange={handleParamChange}
                handleFocus={handleFocus}
                isLoading={isLoading}
                setIsInputChanged={setIsInputChanged}
                handleButtonClick={handleButtonClick}
                isInputChanged={isInputChanged}
              />
            </Box>
          )}
        </Box>
        {!image?.imageURL ? (
          <Grid
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "16%",
            }}
          >
            <CircularProgress style={{ color: Colors.lime }} />
          </Grid>
        ) : (
          <ImageDisplay image={image} isMobile={isMobile} isLoading={isLoading} />
        )}
        {toggleValue === "feed" && (
          <Grid style={{ marginBottom: "1em" }}>
            {image?.imageURL && (
              <ModelInfo model={image["model"]} wasPimped={image["wasPimped"]} />
            )}
          </Grid>
        )}
      </SectionBgBox>
    </SectionContainer>
  )
})
