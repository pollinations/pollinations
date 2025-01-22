import React, { useState, useEffect, useRef, memo, useCallback } from "react"
import { Box, CircularProgress } from "@mui/material"
import { useFeedLoader } from "../utils/useFeedLoader"
import { useImageEditor, useImageSlideshow } from "../utils/useImageSlideshow"
import debug from "debug"
import { ServerLoadInfo } from "../components/FeedImage/ServerLoadInfo"
import { Colors } from "../config/global"
import { ModelInfo } from "../components/FeedImage/ModelInfo"
import { ImageEditor } from "../components/FeedImage/ImageEditor"
import { FeedEditSwitch } from "../components/FeedImage/FeedEditSwitch"
import { ImageDisplay } from "../components/FeedImage/ImageDisplay"
import { SectionContainer, SectionSubContainer, SectionHeadlineStyle } from "../components/SectionContainer"
import SectionTitle from "../components/SectionTitle"
import { IMAGE_FEED_SUBTITLE, IMAGE_FEED_TITLE } from "../config/copywrite"
import { getImageURL } from "../utils/getImageURL"
import { LLMTextManipulator } from "../components/LLMTextManipulator.js"
import background from "../assets/background/Fractal_tessellation_network.webp"
import background2 from "../assets/background/Nanoscale_material_topography_1.webp"
import background3 from "../assets/background/Nanoscale_material_topography2.webp"

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
    <SectionContainer backgroundImage={background3}>
      <SectionSubContainer>
        <SectionTitle title={IMAGE_FEED_TITLE} />
      </SectionSubContainer>
      <SectionSubContainer>
        <ServerLoadInfo lastImage={lastImage} imagesGenerated={imagesGenerated} image={image} />
      </SectionSubContainer>
      <SectionSubContainer>
        <SectionHeadlineStyle>
          <LLMTextManipulator>{IMAGE_FEED_SUBTITLE}</LLMTextManipulator>
        </SectionHeadlineStyle>
      </SectionSubContainer>
      <SectionSubContainer>
        {image?.imageURL && (
          <Box
            sx={{
              backgroundColor: `${Colors.offblack2}0`,
              width: "100%",
            }}
          >
            <Box display="flex" justifyContent="center" mb={2}>
              <FeedEditSwitch
                toggleValue={toggleValue}
                handleToggleChange={handleToggleChange}
                isLoading={isLoading}
              />
            </Box>
            <Box paddingBottom="1em">
              <ImageEditor
                image={image}
                imageParams={imageParams}
                handleParamChange={handleParamChange}
                handleFocus={handleFocus}
                isLoading={isLoading}
                setIsInputChanged={setIsInputChanged}
                handleButtonClick={handleButtonClick}
                isInputChanged={isInputChanged}
                isStopped={isStopped}
                stop={stop}
                switchToEditMode={switchToEditMode}
                edit={isStopped}
                toggleValue={toggleValue}
              />
            </Box>
          </Box>
        )}

        {!image?.imageURL ? (
          <SectionSubContainer>
            <CircularProgress sx={{ color: Colors.lime }} />
          </SectionSubContainer>
        ) : (
          <ImageDisplay image={image} isLoading={isLoading} />
        )}
        {toggleValue === "feed" && (
          <SectionSubContainer>
            <br />
            {image?.imageURL && <ModelInfo model={image["model"]} referrer={image["referrer"]} />}
          </SectionSubContainer>
        )}
      </SectionSubContainer>
    </SectionContainer>
  )
})
