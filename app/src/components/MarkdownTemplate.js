import { textContent } from "../assets"
import MarkDownContent from "./MarkDownContent"
import { BackGroundImage, MarkDownStyle, SmallContainer } from "../styles/global"
import { SEOImage, SEOMetadata } from "./Helmet"

const PageTemplate = ({ label }) => {



  if (!label) return <></>

  return (
    <SmallContainer>
      <MarkDownStyle >
        <SEOMetadata title={`${label[0].toUpperCase()}${label.slice(1)}`} />
        <SEOImage />
        <MarkDownContent url={textContent[label]} />
      </MarkDownStyle>
      <BackGroundImage 
            src='gradient_background.png'
            top='0'
        position='fixed'
        zIndex='-1' 
        opacity='50%'
        transform='rotate(-180deg)' 
        alt="hero_bg_overlay" />
    </SmallContainer>
  )
}

export default PageTemplate
