import styled from "@emotion/styled"
import { EXPOS, textContent } from "../assets"
import ExpoTeaser from "../components/ExpoTeaser"
import MarkDownContent from "../components/molecules/MarkDownContent"
import { COLORS } from "../_globalConfig/colors"
import { content } from "./styles/content"

const ExpoPage = (props) => {
  return (
    <Wrapper>
      <MarkDownContent url={textContent.expo} />
      {Object.keys(EXPOS).map((expoId) => (
        <ExpoTeaser className="expo-teaser" expoId={expoId} />
      ))}
    </Wrapper>
  )
}

export default ExpoPage

const Wrapper = styled.main`
  ${content};
  > .expo-teaser + .expo-teaser {
    border-top: 1px solid ${COLORS.font.default};
  }
`
