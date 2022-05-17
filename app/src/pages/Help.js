import { textContent } from "../assets"
import MarkDownContent from "../components/molecules/MarkDownContent"
import { SmallContainer } from "./styles/base"

const Help = () => {
  return (
    <SmallContainer>
      <MarkDownContent url={textContent.help} />
    </SmallContainer>
  )
}

export default Help
