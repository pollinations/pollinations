import styled from '@emotion/styled'
import { BackGroundImage, GlobalSidePadding, Headline, MOBILE_BREAKPOINT } from '../styles/global'
import heroBGOverlay from '../assets/imgs/bgherooverlay.jpeg'

// why we do it


const AboutPage = props => {
  
    return <HeroStyle>
  
      <GridTwoColumns>
        <div >
          <Headline>
              about
          </Headline>
        </div>
        <div>
          <ExplanationText>
            Pollinations is a platform to generate media with the help of AI. 
            Here you can create customized, royalty-free pieces of audio, images, 3D objects and soon fully immersive 3D environments on the fly.
            <br/><br/>
            We offer cutting-edge AI models that are constantly being updated. Every creation is unique and free to use.
          </ExplanationText>
        </div>
      </GridTwoColumns>
  
  
      <BackGroundImage 
        src={heroBGOverlay} 
        top='auto'
        zIndex='-1' 
        transform='rotate(-180deg)' 
        alt="hero_bg_overlay" />
      
    
    </HeroStyle>
  }

export default AboutPage



const ExplanationText = styled.p`
font-family: 'DM Sans';
font-style: normal;
font-weight: 400;
font-size: 24px;
line-height: 31px;
color: #FFFFFF;

margin-top: 7em;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  margin-top: 1em;
}
`
  
const GridTwoColumns = styled.div`
width: 100%;
padding: 10em 4em;
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
align-items: flex-start;

`
const HeroStyle = styled.div`
min-height: 100vh;
display: flex;
flex-direction: column;
align-items: center;

width: 100%;
padding: ${GlobalSidePadding};
`;