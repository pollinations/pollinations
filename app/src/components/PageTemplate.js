import { textContent } from "../assets"
import MarkDownContent from "../components/molecules/MarkDownContent"
import { SmallContainer } from "../pages/styles/base"
import { SEOMetadata } from "./Helmet"

const PageTemplate = ({ label }) => {



  if (!label) return <></>

  return (
    <SmallContainer>
      <SEOMetadata title={`${label[0].toUpperCase()}${label.slice(1)}`} />
      <MarkDownContent url={textContent[label]} />
    </SmallContainer>
  )
}

export default PageTemplate
