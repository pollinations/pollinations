import styled from '@emotion/styled'
import { BackGroundImage, GlobalSidePadding, MOBILE_BREAKPOINT } from '../styles/global'
import whyBG from '../assets/imgs/doubleBg.png'
import { useNavigate } from 'react-router-dom'
import StarIMG from '../assets/imgs/star.png'
// why we do it
import AvatarClipIMG from '../assets/imgs/avatar_clip_example.png'
import DreamfieldsIMG from '../assets/imgs/dreamfields_example.png'

const Showcase3d = props => {
  
    return <HeroStyle>
  
      <GridTwoColumns>
          <Headline >
            <span>
              With Pollinations, creativity is scalable <br/>
            </span>
              It's time to populate the metaverse
          </Headline>
          <ExplanationText>
          
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
        <IMGContainer>
        <ExampleIMG src={AvatarClipIMG} alt='Avatar Clip Example' prompt='test' />
        <p>
          <i>“queer neon warrior”</i>
        </p>
        </IMGContainer>
      </GridTwoColumns>
      <GridTwoColumns>
      

        <Example title='Dreamfields - v1.0 - DreamyGhosts' url='/create/dreamfields' marginTop='15em'>
        Our dear generalist model can now create cute 3D ghosts from scratch. The results are definitely a bit glitchy so far, and it will take around 30 minutes to generate one model.
          <br/><br/>
        Have fun creating your own 3D ghost :).
        </Example>
        <IMGContainer>
          <ExampleIMG src={DreamfieldsIMG} alt='Avatar Clip Example' />
          <p>
            <i>“purple robot”</i>
          </p>
        </IMGContainer>
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

export default Showcase3d



const Example = (props) => {
  const navigate = useNavigate()

  const { title, url, children, right, marginTop } = props;


  return <div>
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
}

const IMGContainer = styled.div`
margin: auto;
p {
  text-align: center;
}
`

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
  max-width: 325px;
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
margin-bottom: 2em;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  margin-top: 1em;
  max-width: 325px;

}
`
  
const GridTwoColumns = styled.div`
width: 100%;
max-width: 1280px;
position: relative;

padding: 10em 4em;
gap: 2em;
display: grid;
grid-template-columns: repeat(auto-fit, minmax(325px, 1fr));
align-items: ${props => props.alignItems || 'flex-start'};

`
const ExampleIMG = styled.img`
width: 100%;
max-width: 300px;
max-height: 500px;
`
const HeroStyle = styled.div`
display: flex;
flex-direction: column;
align-items: center;

max-width: 100%;
position: relative;
padding: 0em 0 10em 0;

`;


const StarImage = styled.img`

width: 77px;

position: absolute;
left: ${props => props.left || ''};
right: ${props => props.right || ''};
top: ${props => props.top || ''};
bottom: ${props => props.bottom || ''};
`