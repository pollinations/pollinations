import styled from '@emotion/styled';
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
    <Player src='https://streamable.com/c12w4k' />
  </PlayerWrapper>
  <BackgroundImage 
    src='bgHero.png' 
    zIndex='-2' 
    alt="hero_bg" />

</Style>;
  
export default Hero
const PlayerWrapper = styled.div`
position: absolute;
overflow: hidden;
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