import styled from '@emotion/styled'
import { BackGroundImage, GlobalSidePadding, MOBILE_BREAKPOINT } from '../../styles/global'
import whyBG from '../../assets/imgs/doubleBg.png'
import DiscordIMG from '../../assets/imgs/discord_section.png'
import { CreateButton } from './Tryout'
import { useNavigate } from 'react-router-dom'
import StarIMG from '../../assets/imgs/star.png'
// why we do it


const WhyWeDoIt = props => {
  const navigate = useNavigate()
  
    return <HeroStyle>
  
      <GridTwoColumns>
        <div >
          <Headline >
            <span>
                3D Objects and Avatars Models <br/>
            </span>
            With Pollinations, 
            creativity is scalable
          </Headline>
        </div>
        <div>
        <ExplanationText textAlign='left'>
         
            Welcome to Pollination's 3D avatar model! Beta Version. 
            <br/><br/>
            Here you can generate customized AI humanoid avatars with color and texture from a text prompt. Every result is unique and is made completely by Artificial Intelligence.
            <br/><br/>
            For a texturized avatar we suggest at least 20.000 interactions, the generation will take about one to two hours. 
            The creation of untexturized avatars takes only a few minutes.  Have fun and let us know what you think.

          {/* <br/><br/>
          And by facilitating the creation of images, objects and immersive environments, 
          we help to <b>build the metaverse</b> the way we want it: trippy! */}

          </ExplanationText>
        </div>
      </GridTwoColumns>

      <GridTwoColumns>
        <FlexColumn >
            <div>
            <Headline color='white'>
                blabla
            </Headline>
            <ExplanationText color='white' marginTop='0'>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. 
            </ExplanationText>
            </div>

          <Button >
            Try it out
          </Button>

        </FlexColumn>
        <StarImage src={StarIMG} top='-50' left='0' />
        <StarImage src={StarIMG} bottom='-50' right='0' />
      </GridTwoColumns>
  
  
  
      <BackGroundImage 
          src={whyBG} 
          top='auto'
          zIndex='-1' 
          alt="hero_bg_overlay" />
    
    </HeroStyle>
  }

  export default WhyWeDoIt


const Button = styled(CreateButton)`
align-self: flex-start;
margin-left: 0;
`

const Headline = styled.p`
font-family: 'DM Sans';
font-style: normal;
font-weight: ${props => props.fontWeight || '400'};
font-size: ${props => props.fontSize || '56px'};
line-height: ${props => props.lineHeight || '73px'};
color: ${props => props.color || '#000000'};
margin-top: 0;
text-align: ${props => props.textAlign || 'left'};
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
font-size: 24px;
line-height: 31px;
text-align: ${props => props.textAlign || 'left'};
color: ${props => props.color || '#191919'};

margin-top: ${props => props.marginTop || '7em'};
@media (max-width: ${MOBILE_BREAKPOINT}) {
  margin-top: 1em;
}
`
  
const GridTwoColumns = styled.div`
width: 100%;
max-width: 1280px;
position: relative;

padding: 10em 4em;
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
align-items: ${props => props.alignItems || 'flex-start'};

`
const HeroStyle = styled.div`
display: flex;
flex-direction: column;
align-items: center;

width: 100%;
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