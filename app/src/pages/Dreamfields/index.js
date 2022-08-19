import styled from '@emotion/styled'
import { BackGroundImage, GlobalSidePadding, MOBILE_BREAKPOINT } from '../../styles/global'
import whyBG from '../../assets/imgs/doubleBg.png'
import { useNavigate } from 'react-router-dom'
import StarIMG from '../../assets/imgs/star.png'
// why we do it


const DreamFieldsScreen = props => {
  
    return <HeroStyle>
  
      <GridTwoColumns>
        <div >
          <Headline >
            <span>
              It's time to populate the metaverse <br/>
            </span>
            With Pollinations, 
            creativity is scalable
          </Headline>
        </div>
          <ExplanationText textAlign='left'>
          
              the need to design digital worlds is rising fast, but the power is still too concentrated, and the process too costly and time-consuming, making experimentation difficult. 
              <br/><br/>
              But if we want  metaverses that are ascomplex and trippy as they are is in our dreams, we urgently need to update our tools. 
              <br/><br/>
              We invite you to try out  our -beta version- interface to create Avatars and 3D Object with AI!
              <br/><br/>
              These models could be integrated in the workflow of 3D modellers and designers, or they could be offered to players inside games and immersive experiences. 
              <br/> Every result is unique and is made completely by Artificial Intelligence.

          </ExplanationText>
      </GridTwoColumns>

      <GridTwoColumns>

        <Example title='Avatar Clip' url='/create/avatarclip'>
          Here you can generate customized AI humanoid avatars with color and texture from a text prompt.  
          <br/><br/>
          For a texturized avatar we suggest at least 20.000 interactions, the generation will take about one to two hours. The creation of untexturized avatars takes only a few minutes. 
          <br/>Have fun and let us know what you think. We are working on implementing rigged skeletons to make the results completely metaverse-ready.
          <br/>
          Try descriptions such as "gender neutral magic elf" or "pregnant spiderwoman"
        </Example><div/><div/>

        
        <Example title='Dreamfields' url='/create/dreamfields' right>
        Our dear generalist model can create any 3d object from scratch. Don't be shy to play around with different parameters, the results are definitely bit glitchy so far.   
          <br/><br/>
          For a texturized avatar we suggest at least 20.000 interactions, the generation will take about one to two hours.  
          <br/>The creation of untexturized avatars takes only a few minutes.
          <br/>
          Remember- this is only the first version of Dreamfields. We are working on fine tuning results!
        </Example>
        <StarImage src={StarIMG} top='-100' left='0' />
        <StarImage src={StarIMG} bottom='-50' right='0' />
        </GridTwoColumns>

  
  
      <BackGroundImage 
          src={whyBG} 
          top='auto'
          zIndex='-1' 
          alt="hero_bg_overlay" />
    
    </HeroStyle>
  }

  export default DreamFieldsScreen



const Example = (props) => {
  const navigate = useNavigate()

  const { title, url, children, right } = props;


  return <FlexColumn right={right}>
    <div >
      <Headline color='white'>
        {title}
      </Headline>

      <ExplanationText color='white' marginTop='0'>
        {children} 
      </ExplanationText>
      <CreateButton onClick={()=>navigate(url)}>
      Try it out
      </CreateButton>
    </div>



  </FlexColumn>
}



 const CreateButton = styled.button`

width: 129px;
height: 52;
background: #D8E449;
border-radius: 40px;

margin-left: ${props => props.marginLeft || 'calc(-129px - 0.5em)'};

border: none;

font-family: 'DM Sans';
font-style: normal;
font-weight: 700;
font-size: 17px;
line-height: 22px;
text-align: center;
text-transform: uppercase;

color: #040405;
cursor: pointer;

align-self: flex-start;
margin-left: 0;
:disabled {
background-color: grey;
}

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
align-self: flex-start;

font-family: 'DM Sans';
font-style: normal;
font-weight: 400;
font-size: 24px;
line-height: 31px;
text-align: ${props => props.textAlign || 'left'};
color: ${props => props.color || '#191919'};

margin-top: ${props => props.marginTop || '7em'};
width: 80%;
max-width: 600px;
margin-bottom: 2em;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  margin-top: 1em;
  width: 100%;
}
`
  
const GridTwoColumns = styled.div`
width: 100%;
max-width: 1280px;
position: relative;

padding: 10em 4em;
display: grid;
grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
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