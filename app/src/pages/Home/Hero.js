import styled from '@emotion/styled';
import heroBG from '../../assets/imgs/bg_hero_landing.png';
import scrolldown from '../../assets/imgs/scrolldown_hero_landing.png';
import { BackGroundImage, MOBILE_BREAKPOINT } from '../../styles/global';
// Hero Section

const Hero = props => {

    return <HeroStyle>
  
      <HeroHeadline>
        YOUR ENGINE FOR
        <br/>
        <span> PERSONALIZED MEDIA </span>
      </HeroHeadline>

      <HeroSubHeadLine>
        We combine and fine-tune algorithms to match any aesthetics, allowing the creation of unlimited, customized AI media.
      </HeroSubHeadLine> 
          

      <ScrollDown src={scrolldown}/>
      <HeroImage 
        src={heroBG} 
        zIndex='-2' 
        alt="hero_bg" />
  
    </HeroStyle>
  }

  export default Hero

  const ScrollDown = styled.img`
  position: absolute;
  width: 90px;
  height: 46px;
  right: 30px;
  bottom: 36px;
  `
  
  const HeroStyle = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-start;

  width: 100%;
  min-height: 100vh;

  padding: 4.7% 5%;
  `;
  
  const HeroImage = styled(BackGroundImage)`
  height: 100%;
  @media (max-width: ${MOBILE_BREAKPOINT}) {
  height: auto;
  min-height: 100vh;
  }
  `
  
  
  const HeroHeadline = styled.p`
  font-family: 'SERAFIN';
  font-style: normal;
  font-weight: 400;
  font-size: 92px;
  line-height: 94px;
  text-transform: capitalize;
  margin: 0;
  color: #FAFAFA;

  span {
    color: #E0F142;
  }

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    max-width: 600px;
    font-size: 38px;
    line-height: 35px;
  }
  
  `
  
  const HeroSubHeadLine = styled.p`
  max-width: 500px;
  font-family: 'Uncut-Sans-Variable';
  font-style: normal;
  font-weight: 400;
  font-size: 24px;
  line-height: 34px;
  color: #FAFAFA;  
  

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    font-size: 18px;
    max-width: 70%;
    line-height: 25px;
  }
  `