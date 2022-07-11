import styled from '@emotion/styled'
import { BackGroundImage, GlobalSidePadding, MOBILE_BREAKPOINT } from '../../styles/global'
import whyBG from '../../assets/imgs/bg2.png'

// why we do it


const WhyWeDoIt = props => {
  
    return <HeroStyle>
  
      <GridTwoColumns>
        <div >
          <Headline>
            <span>
              why we do it <br/>
            </span>
            With Pollinations, 
            creativity becomes scalable
          </Headline>
        </div>
        <div>
          <ExplanationText>
          We integrate with companies to offer users 
          one of the best AI-powered creative experiences out there.
          <br/><br/>
          This way we can keep Pollinations free for 
          visitors and reward developers and artists for their work.
          <br/><br/>
          Pollinations also helps to build 
          the metaverse the way we want it: trippy! It’s truly a win-win-win-win
          </ExplanationText>
        </div>
      </GridTwoColumns>
  
  
  
      <BackGroundImage 
          src={whyBG} 
          top='auto'
          zIndex='-1' 
          alt="hero_bg_overlay" />
    
    </HeroStyle>
  }

  export default WhyWeDoIt

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

background: url(${whyBG});
background-size: cover;
background-position: center;

`;