import styled from '@emotion/styled'
import { BackGroundImage, GlobalSidePadding, MOBILE_BREAKPOINT } from '../../styles/global'
import whyBG from '../../assets/imgs/doubleBg.png'
import DiscordIMG from '../../assets/imgs/discord_section.png'
import { CreateButton } from './TryOut'
import { useNavigate } from 'react-router-dom'
import StarIMG from '../../assets/imgs/star.png'
// why we do it


const WhyWeDoIt = props => {
  const navigate = useNavigate()
  
    return <HeroStyle>
  
      <GridTwoColumns>
        <div >
          <Headline>
            <span>
              why we do it <br/>
            </span>
            With Pollinations, 
            creativity is scalable
          </Headline>
        </div>
        <div>
        <ExplanationText>
          We <b>integrate with companies</b> to offer one of the best AI-based creative experiences out there, 
          empowering people to generate fresh media without the need to switch platforms. 

          <br/><br/>
          We also <b>develop presets</b> and combine different models to ensure that all media created within the platforms fits the brand’s aesthetics, keeping the looks consistent. 

          <br/><br/>
          And by facilitating the creation of images, objects and immersive environments, 
          we help to <b>build the metaverse</b> the way we want it: trippy!

          </ExplanationText>
        </div>
      </GridTwoColumns>

      <GridTwoColumns alignItems='center'>
        <FlexColumn >
          <img src={DiscordIMG} alt="discord"  />
          <a href='https://discord.gg/XXd99CrkCr'>
          <CreateButton marginLeft='0'>
            Start
          </CreateButton>
          </a>
        </FlexColumn>
        <div>
        <Headline fontSize='44px' color='#F6F6F6' lineHeight='57.29px' fontWeight='500' margin='0'>
          Discuss, get help and <br/>
          contribute on Discord.

        </Headline>
        </div>
        <StarImage src={StarIMG} top='10' left='50' />
        <StarImage src={StarIMG} bottom='20' right='50' />
      </GridTwoColumns>
  
  
  
      {/* <BackGroundImage 
          src={whyBG} 
          top='auto'
          zIndex='-1' 
          alt="hero_bg_overlay" /> */}
    
    </HeroStyle>
  }

  export default WhyWeDoIt

const Headline = styled.p`
font-family: 'DM Sans';
font-style: normal;
font-weight: ${props => props.fontWeight || '400'};
font-size: ${props => props.fontSize || '56px'};
line-height: ${props => props.lineHeight || '70px'};
color: ${props => props.color || '#000000'};
margin-top: 0;
margin: ${props => props.margin || ''};
span {
  font-weight: 700;
  font-size: 24px;
  line-height: 31px;
  margin: 0;
  color: #ffffff;
}
@media (max-width: ${MOBILE_BREAKPOINT}) {
  font-size: 48px;
  line-height: 60px;
}
`
const ExplanationText = styled.p`
font-family: 'DM Sans';
font-style: normal;
font-weight: 400;
font-size: 22px;
line-height: 30px;
color: #191919;

margin-top: 9em;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  margin-top: 1em;
}
`
  
const GridTwoColumns = styled.div`
width: 100%;
max-width: 1280px;
position: relative;

padding: 10em 7em;
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
align-items: ${props => props.alignItems || 'flex-start'};

@media (max-width: ${MOBILE_BREAKPOINT}) {
  padding: 10em 1.5em;
}

`
const HeroStyle = styled.div`
display: flex;
flex-direction: column;
align-items: center;

width: 100%;
max-width: 100vw;
position: relative;
padding: 0em 0 10em 0;

`;

const FlexColumn = styled.div`
display: flex;
flex-direction: column;
gap: 2em;
align-items: center;
margin-right: 10em;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  margin-right: 2em;
  margin-bottom: 4em;
}

img {
  width: 20vw;
  max-width: 100%;
  @media (max-width: ${MOBILE_BREAKPOINT}) {
    width: 100%;
    max-width: 200px;
  }
}
`

const StarImage = styled.img`

width: 77px;

position: absolute;
left: ${props => props.left || ''};
right: ${props => props.right || ''};
top: ${props => props.top || ''};
bottom: ${props => props.bottom || ''};
`