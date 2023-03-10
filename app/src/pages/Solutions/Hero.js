import styled from '@emotion/styled';
import heroBG from '../../assets/imgs/yellow-grad.png';
import scrolldown from '../../assets/imgs/scrolldown_hero_landing.png';
import { MOBILE_BREAKPOINT, Colors, Fonts } from '../../styles/global';
import { BackgroundImage, Container as ContainerBase } from './components';
import Player from './Player';


const Hero = props => <Style>
  <Container>
    <Headline>
      AI powered experiences  
    </Headline>
      
  </Container>
  <PlayerWrapper>
  {/* <iframe width="100%" height="100%" src="https://www.youtube.com/embed/HHaxu013Jfo?controls=0&modestbranding=1&autoplay=1&loop=1" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loop autoplay muted></iframe> */}
  <Player src='https://www.twitch.tv/watchmeforever' />
  </PlayerWrapper>
  <BackgroundImage 
    src='bgHero.png' 
    zIndex='-2' 
    alt="hero_bg" />

</Style>;
  
export default Hero
const PlayerWrapper = styled.div`
position: absolute;
left: 0;
right: 0;
top: 0;
bottom: 0;
z-index: -1;
`
const Style = styled.div`
width: 100%;
height: 100%;
position: relative;

display: flex;
justify-content: center;
`

const Container = styled(ContainerBase)`
position: relative;
display: flex;
flex-direction: column;
justify-content: center;
align-items: center;

// padding: 3.19% 4.72% ;
`;


const Headline = styled.p`
max-width: 60%;
font-family: ${Fonts.headline};
font-style: normal;
font-weight: 400;
font-size: 96px;
line-height: 106px;
text-transform: capitalize;
margin: 0;
color: ${Colors.offwhite};

text-align: center;
text-transform: capitalize;


span {
  font-family: ${Fonts.headline};
  color: ${Colors.lime};
}

@media (max-width: ${MOBILE_BREAKPOINT}) {
  font-size: 56px;
  line-height: 62px;
}`;

const SubHeadline = styled.p`
max-width: 500px;
font-family: 'Uncut-Sans-Variable';
font-style: normal;
font-weight: 400;
font-size: 24px;
line-height: 34px;
color: ${Colors.offWhite};

@media (max-width: ${MOBILE_BREAKPOINT}) {
  font-size: 20px;
  line-height: 27px;
}`;