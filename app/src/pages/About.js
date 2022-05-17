import { textContent } from "../assets"
import MarkDownContent from "../components/molecules/MarkDownContent"
import { SmallContainer } from "./styles/base"

const About = () => {
  return (
    <SmallContainer>
      <MarkDownContent url={textContent.about} />
    </SmallContainer>
  )
}

export default About
