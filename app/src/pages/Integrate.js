import styled from '@emotion/styled'
import { BackGroundImage, GlobalSidePadding, MOBILE_BREAKPOINT } from '../styles/global'
import whyBG from '../assets/imgs/bg1.jpg'

// why we do it


const Integrate = props => {
  
    return <HeroStyle>
  
      <GridTwoColumns>
        <div >
          <Headline>
            Integrate
          </Headline>
        </div>
        <div>
          <ExplanationText>
          Imagine a gaming platform in which players can <b>create 3D objects</b> inside the game just by typing a few words into a box, or an NFT marketplace in which users can <b>create and mint NFTs</b> on the spot. Not bad, huh?
          <br/><br/>
        
          By integrating with Pollinations’ API users can create all of this and much more <b> without switching platforms.</b> We offer <b>presets and looks</b> so that all media created can have the visual identity of your brand.
          <br/><br/>

          Music platforms, NFTs, articles about emerging technology, luxury hotels, 3D object stores and many more are getting a touch of magic with Pollinations’ AI-power. Let us hear about your goals at hello@pollinations.ai.

          </ExplanationText>
        </div>
      </GridTwoColumns>

      <GridTwoColumns>
        <div >
          <Headline>
          Build community through AI art!
          </Headline>
        </div>
        <div>
          <ExplanationText>
              Imagine that within Discord or Slack people can write a prompt to a bot and get the exact media they want. They can create challenges, NFTs, games and much more, making for a fun, interactive, artistic experience. To see what this looks like, send us a hello at hello@pollinations.ai.
          </ExplanationText>
        </div>
      </GridTwoColumns>
  
  
  
      <BackGroundImage 
          src={whyBG} 
          top='auto'
          position='fixed'
          zIndex='-1' 
          alt="hero_bg_overlay" />
    
    </HeroStyle>
  }

  export default Integrate

const Headline = styled.p`
font-family: 'DM Sans';
font-style: normal;
font-weight: 400;
font-size: 56px;
line-height: 73px;
color: #000000;
margin-top: 0;

span {
  font-weight: 700;
  font-size: 24px;
  line-height: 31px;
  margin: 0;
  color: #ffffff;
}
`
const ExplanationText = styled.p`
font-family: 'DM Sans';
font-style: normal;
font-weight: 400;
font-size: 24px;
line-height: 31px;
color: #191919;

margin-top: 5em;
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
max-width: 1280px;
padding: ${GlobalSidePadding};

background: url(${whyBG});
background-size: cover;
background-position: center;

`;