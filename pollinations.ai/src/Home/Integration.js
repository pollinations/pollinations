import React, { useContext } from "react"
import { Colors } from "../config/global"
import { CodeExamples } from "../components/Integrate/CodeExamples"
import { SectionContainer, SectionSubContainer, SectionHeadlineStyle } from "../components/SectionContainer.js"
import { INTEGRATION_TITLE, INTEGRATION_SUBTITLE } from "../config/copywrite"
import SectionTitle from "../components/SectionTitle"
import { LLMTextManipulator } from "../components/LLMTextManipulator"
import { ImageContext } from "../utils/ImageContext"

export const Integration = () => {
  const { image } = useContext(ImageContext)

  return (
    <SectionContainer style={{ backgroundColor: Colors.offblack }}>
      <SectionSubContainer>
        <SectionTitle title={INTEGRATION_TITLE} />
      </SectionSubContainer>
      <SectionSubContainer>
        <SectionHeadlineStyle>
          <LLMTextManipulator>{INTEGRATION_SUBTITLE}</LLMTextManipulator>
        </SectionHeadlineStyle>
      </SectionSubContainer>
      <CodeExamples image={image} />
    </SectionContainer>
  )
}
