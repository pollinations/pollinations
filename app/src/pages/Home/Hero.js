import styled from '@emotion/styled';
import { MOBILE_BREAKPOINT, Colors, Fonts } from '../../styles/global';
import { BackgroundImage, Container as ContainerBase } from './components';
import Player from './Player';

import { Divider, Typography } from '@material-ui/core';
import { GenerativeImageFeed } from './GenerativeImageFeed';

const Hero = props => <Style>
  {/* <Container>
    <Headline>
      Pollinations
    </Headline>
      
  </Container> */}
  <HeroContainer>
    <Player src='https://streamable.com/w9p5rz' />
  </HeroContainer>
  {/* <BackgroundImage 
    src='bgHero.png' 
    zIndex='-2' 
    alt="hero_bg" /> */}

</Style>;
  
export default Hero;


const Style = styled.div`
width: 100%;
height: 100%;
position: relative;

display: flex;
justify-content: center;
`


const HeroContainer = styled.div`
  position: relative;
  height: 50vh;
  width: 100vw;
  overflow: hidden;

  .VideoBackground{
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 100%;
    object-fit: cover;
  }
`;

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