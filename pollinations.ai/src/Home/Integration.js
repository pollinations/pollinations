import React, { useContext } from "react"
import { Colors } from "../config/global"
import { CodeExamples } from "../components/Integrate/CodeExamples"
import { SectionContainer, SectionSubContainer, SectionHeadlineStyle } from "../components/SectionContainer.js"
import { INTEGRATION_TITLE, INTEGRATION_SUBTITLE } from "../config/copywrite"
import SectionTitle from "../components/SectionTitle"
import { LLMTextManipulator } from "../components/LLMTextManipulator"
import { ImageContext } from "../utils/ImageContext"
import background from "../assets/background/Fractal_tessellation_network.webp"
import background2 from "../assets/background/Nanoscale_material_topography_1.webp"
import background3 from "../assets/background/Nanoscale_material_topography2.webp"

export const Integration = () => {
  const { image } = useContext(ImageContext)

  return (
    <SectionContainer backgroundImage={background2}>
      <SectionSubContainer>
        <SectionTitle title={INTEGRATION_TITLE} />
      </SectionSubContainer>
      <SectionSubContainer>
        <SectionHeadlineStyle>
          <LLMTextManipulator>{INTEGRATION_SUBTITLE}</LLMTextManipulator>
        </SectionHeadlineStyle>
      </SectionSubContainer>
      <SectionSubContainer>
        <CodeExamples image={image} />
      </SectionSubContainer>
    </SectionContainer>
  )
}
