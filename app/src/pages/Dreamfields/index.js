import styled from '@emotion/styled'
import { BackGroundImage, GlobalSidePadding, MOBILE_BREAKPOINT } from '../../styles/global'
import whyBG from '../../assets/imgs/doubleBg.png'
import { useNavigate } from 'react-router-dom'
import StarIMG from '../../assets/imgs/star.png'
// why we do it
import AvatarClipIMG from '../../assets/imgs/avatar_clip_example.png'
import DreamfieldsIMG from '../../assets/imgs/dreamfields_example.png'

const DreamFieldsScreen = props => {
  
    return <HeroStyle>
  
      <GridTwoColumns>
        <div >
          <Headline >
            <span>
              With Pollinations, creativity is scalable <br/>
            </span>
              It's time to populate the metaverse
          </Headline>
        </div>
          <ExplanationText textAlign='left'>
          
              The need to design digital worlds is rising fast, but doing it is still too costly and time-consuming, making experimentation difficult.
              <br/><br/>
              If we want metaverses that are as complex and trippy as they are in our dreams, we urgently need to update our tools. 
              <br/><br/>
              We invite you to try our beta version interface to create avatars and 3D objects with AI!
              <br/><br/>
              These models could be incorporated into the workflow of 3D modelers and designers, or they could be integrated into games and immersive experiences, allowing players to create 3D media. Every result is unique, royalties-free, and is made completely by Artificial Intelligence.

          </ExplanationText>
      </GridTwoColumns>

      <GridTwoColumns>

        <Example title='Avatar Clip' url='/create/avatarclip'>
          With this AI model you can generate customized humanoid avatars, with color and texture, from a text prompt.  
          <br/><br/>
          A fine avatar creates texturized and colorful results, the generation will take about one to two hours. Increase the number of iterations for a more detailed result. 
          You can create shape-only avatars by choosing the option “no” at the “fine” box , the generation will then take only a few minutes.
          <br/><br/>
          Try descriptions such as "gender neutral magic elf", or  "pregnant spiderwoman".
          We are working on implementing rigged skeletons to make the results completely metaverse-ready.
        </Example>
        <ExampleIMG src={AvatarClipIMG} alt='Avatar Clip Example' />

        
        <Example title='Dreamfields' url='/create/dreamfields' marginTop='15em'>
          Our dear generalist model can create 3D objects from scratch. The results are definitely a bit glitchy so far, and it will take around 30 minutes to generate one object.  
          <br/><br/>
          Remember- this is only the first version of Dreamfields. We are working on fine-tuning the model and clarifying the meaning of each parameter, but until then, have fun with the absurdity.
        </Example>
        <ExampleIMG src={DreamfieldsIMG} alt='Avatar Clip Example' />

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

  const { title, url, children, right, marginTop } = props;


  return <FlexColumn right={right} marginTop={marginTop}>
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
  max-width: 100%;
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
const ExampleIMG = styled.img`
max-width: 80%;
max-height: 500px;
margin: auto;
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
margin-top: ${props => props.marginTop || '0'};
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