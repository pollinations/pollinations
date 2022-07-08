import styled from '@emotion/styled'
import { BackGroundImage, Headline } from '../../styles/global'
import whyBG from '../../assets/imgs/bg2.png'

// why we do it


const WhyWeDoIt = props => {
  
    return <HeroStyle>
  
      <GridTwoColumns>
        <Headline>
          With Pollinations, 
          creativity becomes scalable
        </Headline>
        <Headline>
          With Pollinations, 
          creativity becomes scalable
        </Headline>
      </GridTwoColumns>
  
  
  
      <BackGroundImage 
          src={whyBG} 
          top='auto'
          zIndex='-1' 
          alt="hero_bg_overlay" />
    
    </HeroStyle>
  }

  export default WhyWeDoIt
  
  const GridTwoColumns = styled.div`
  width: 100%;
  
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  
  `
  const HeroStyle = styled.div`
display: flex;
flex-direction: column;
justify-content: center;
align-items: center;

width: 100%;
min-height: 100vh;
`;