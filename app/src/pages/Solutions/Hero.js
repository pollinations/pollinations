import styled from '@emotion/styled';
import heroBG from '../../assets/imgs/yellow-grad.png';
import scrolldown from '../../assets/imgs/scrolldown_hero_landing.png';
import { MOBILE_BREAKPOINT, Colors, Fonts } from '../../styles/global';
import { BackgroundImage, Container as ContainerBase } from './components';


const Hero = props => <Style>
  <Container>
    <Headline>
    eMpowering people to create media on the spot  
    </Headline>
      
  </Container>

  <BackgroundImage 
    src={heroBG} 
    zIndex='-2' 
    alt="hero_bg" />

</Style>;
  
export default Hero
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

const ScrollDown = styled.img`
position: absolute;
width: 90px;
height: 46px;
right: 2.8%;
bottom: 36px;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  display: none;
}`;

const Headline = styled.p`
max-width: 60%;
font-family: ${Fonts.headline};
font-style: normal;
font-weight: 400;
font-size: 96px;
line-height: 106px;
text-transform: capitalize;
margin: 0;
color: ${Colors.offblack};

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