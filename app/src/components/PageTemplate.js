import { textContent } from "../assets"
import MarkDownContent from "../components/molecules/MarkDownContent"
import { MarkDownStyle, SmallContainer } from "../styles/global"
import { SEOImage, SEOMetadata } from "./Helmet"

const PageTemplate = ({ label }) => {



  if (!label) return <></>

  return (
    <SmallContainer>
      <MarkDownStyle>
        <SEOMetadata title={`${label[0].toUpperCase()}${label.slice(1)}`} />
        <SEOImage />
        <MarkDownContent url={textContent[label]} />
      </MarkDownStyle>
    </SmallContainer>
  )
}

export default PageTemplate
