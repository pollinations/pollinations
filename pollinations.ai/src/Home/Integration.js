import React from "react"
import { Colors } from "../config/global"
import { CodeExamples } from "../components/CodeExamples"
import { SectionContainer } from "../components/SectionContainer"
import { INTEGRATION_TITLE, INTEGRATION_SUBTITLE } from "../config/copywrite"
import SectionTitle from "../components/SectionTitle"
import SectionSubtitle from "../components/SectionSubtitle"
import { SectionSubContainer } from "../components/SectionSubContainer"

export const Integration = ({ image }) => {
  return (
    <SectionContainer
      style={{
        background: `linear-gradient(to bottom, ${Colors.offblack}, ${Colors.offblack2})`,
      }}
    >
      {" "}
      <SectionSubContainer>
        <SectionTitle title={INTEGRATION_TITLE} />
        <SectionSubtitle subtitle={INTEGRATION_SUBTITLE} />
        <CodeExamples image={image} />
      </SectionSubContainer>
    </SectionContainer>
  )
}
