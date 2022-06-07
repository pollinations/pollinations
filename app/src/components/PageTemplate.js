import { textContent } from "../assets"
import MarkDownContent from "../components/molecules/MarkDownContent"
import { SmallContainer } from "../pages/styles/base"

const PageTemplate = ({ label }) => {

  if (!label) return <></>

  return (
    <SmallContainer>
      <MarkDownContent url={textContent[label]} />
    </SmallContainer>
  )
}

export default PageTemplate
