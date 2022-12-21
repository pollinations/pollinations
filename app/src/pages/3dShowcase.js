import styled from '@emotion/styled'
import { useNavigate } from 'react-router-dom'
import whyBG from '../assets/imgs/BG7.png'
import StarIMG from '../assets/imgs/star.png'
import { BackGroundImage, Colors, MOBILE_BREAKPOINT } from '../styles/global'
// why we do it
import AvatarClipIMG from '../assets/imgs/avatar_clip_example.png'
import DreamfieldsIMG from '../assets/imgs/dreamfields_example.png'
import CreateButton from '../components/atoms/CreateButton'

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
              We invite you to try our <b>beta version</b> interface to create avatars and 3D objects with AI!
              <br/><br/>
              These models can be incorporated into the workflow of 3D modelers and designers as well as into games and immersive experiences, allowing users to create 3D assets. Every result is unique, royalties-free, and powered by artificial intelligence.

          </ExplanationText>
      </GridTwoColumns>

      <GridTwoColumns>
        <Example title='Avatar Clip' url='/create/avatarclip'>
          Generate customized humanoid avatars with color and texture, just with a text prompt. 
          <br/><br/>
          Our next phase is to implement rigged skeletons to make the results completely metaverse-ready.
          <br/><br/>
          Tips:
          <ul>
            <li> Include a human-like being in your text prompt, e.g. 'gender-neutral magic elf'</li>
            <li> On Customize, select <b>Yes</b> for texturized and colorful results or <b>>No</b> for faster, shape-only avatars </li> 
            <li> Increase the number of iterations for a more detailed result </li> 
          </ul>
        </Example>
        <IMGContainer>
        <ExampleIMG src={AvatarClipIMG} alt='Avatar Clip Example' prompt='test' />
        <p>
          <i>“queer neon warrior”</i>
        </p>
        </IMGContainer>
      </GridTwoColumns>

      <GridTwoColumns>
      
      

        <Example title='Dreamfields v1.0' url='/create/dreamfields' marginTop='15em'>
          Our dear generalist model can now create cute 3D ghosts from scratch.  <br/>
          The results so far are glossy and glitchy, taking around 30 minutes to be generated.<br/>
          
          <br/>
          Halloween is coming: have fun creating your own 3D ghost 👻
        </Example>
        <IMGContainer>
          <ExampleIMG src={DreamfieldsIMG} alt='Avatar Clip Example' />
          <p>
            <i>“purple robot ghost”</i>
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
      <CreateButtonStyled onClick={()=>navigate(url)}>
        Try it out
      </CreateButtonStyled>
  </div>
}

const IMGContainer = styled.div`
margin: auto;
p {
  text-align: center;
}
`

const CreateButtonStyled = styled(CreateButton)`
margin-left: 0;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  margin-left: 0;
}
`

const Headline = styled.p`
font-style: normal;
font-weight: ${props => props.fontWeight || '400'};
font-size: ${props => props.fontSize || '56px'};
line-height: ${props => props.lineHeight || '73px'};
color: ${props => props.color || '#fff'};
margin-top: 0;
text-align: ${props => props.textAlign || 'left'};
margin: ${props => props.margin || ''};

span {
  font-weight: 700;
  font-size: 24px;
  line-height: 31px;
  margin: 0;
  color: ${Colors.accent};
}
@media (max-width: ${MOBILE_BREAKPOINT}) {
  font-size: 40px;
  line-height: 45px;
  margin: 0;
  span {
    display: none;
    font-size: 20px;
    line-height: 24px;
    max-width: 100%;
  }
}
`
const ExplanationText = styled.p`
align-self: flex-start;

font-style: normal;
font-weight: 400;
font-size: 24px;
line-height: 31px;
text-align: ${props => props.textAlign || 'left'};
color: ${props => props.color || '#fff'};

margin-top: ${props => props.marginTop || '7em'};
margin-bottom: 2em;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  font-size: 18px;
  line-height: 24px;
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