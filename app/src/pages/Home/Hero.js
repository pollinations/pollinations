import styled from '@emotion/styled';
import heroBG from '../../assets/imgs/bg_hero_landing.png';
import scrolldown from '../../assets/imgs/scrolldown_hero_landing.png';
import { MOBILE_BREAKPOINT, Colors } from '../../styles/global';
import { BackgroundImage, Container as ContainerBase } from './components';


const Hero = props => <Style>
  <Container>
    <Headline>
      YOUR ENGINE FOR
      <br/>
      <span> PERSONALIZED MEDIA </span>
    </Headline>

    <SubHeadline>
      We combine and fine-tune algorithms to match any aesthetics, allowing the creation of unlimited, customized AI media.
    </SubHeadline> 
      
    <ScrollDown src={scrolldown}/>

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
justify-content: flex-end;
align-items: flex-start;

padding: 3.19% 4.72% ;
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
font-family: 'SERAFIN';
font-style: normal;
font-weight: 400;
font-size: 92px;
line-height: 94px;
text-transform: capitalize;
margin: 0;
color: ${Colors.offWhite};

span {
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