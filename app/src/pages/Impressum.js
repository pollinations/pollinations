import { textContent } from "../assets"
import MarkDownContent from "../components/molecules/MarkDownContent"
import { SmallContainer } from "./styles/base"

const Impressum = () => {
  return (
    <SmallContainer>
      <MarkDownContent url={textContent.impressum} />
    </SmallContainer>
  )
}

export default Impressum
