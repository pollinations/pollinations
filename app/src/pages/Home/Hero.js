import styled from '@emotion/styled';
import heroBG from '../../assets/imgs/bghero.jpg';
import heroBGOverlay from '../../assets/imgs/bgherooverlay.jpeg';
import { BackGroundImage, MOBILE_BREAKPOINT } from '../../styles/global';
// Hero Section

const Hero = props => {

    return <HeroGradient>
  
      <HeroHeadline>
        YOUR ENGINE FOR PERSONALIZED MEDIA
      </HeroHeadline>

      <HeroSubHeadLine>
        Pollinations curates and combines AI models to match your vision.
      </HeroSubHeadLine> 
      
  
      <HeroImage 
        src={heroBGOverlay} 
        zIndex='-1' 
        opacity='68%' 
        blend='screen' 
        transform='rotate(-180deg)' 
        alt="hero_bg_overlay" />
      
      <HeroImage 
        src={heroBG} 
        zIndex='-2' 
        alt="hero_bg" />
  
    </HeroGradient>
  }

  export default Hero
  
  const HeroStyle = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  width: 100%;
  min-height: 100vh;
  `;
  
  const HeroGradient = styled(HeroStyle)`
    background: radial-gradient(50% 74.25% at 50% 53.59%, 
    rgba(22, 50, 122, 0.58) 0%, 
    rgba(34, 128, 134, 0.54) 47.4%, 
    rgba(151, 190, 67, 0.01) 100%);
    max-height: 100vh;
  `
  const HeroImage = styled(BackGroundImage)`
  height: 100%;
  @media (max-width: ${MOBILE_BREAKPOINT}) {
  height: auto;
  min-height: 100vh;
  }
  `
  
  
  const HeroHeadline = styled.p`
  max-width: 750px;
  font-family: 'Leiko';
  font-style: normal;
  font-weight: 400;
  font-size: 64px;
  line-height: 82px;
  text-align: center;
  text-transform: uppercase;
  margin: 0;
  color: #FFFFFF;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    max-width: 600px;
    font-size: 38px;
    line-height: 35px;
  }
  
  `
  
  const HeroSubHeadLine = styled.p`
  max-width: 500px;
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 400;
  font-size: 26px;
  line-height: 34px;
  /* identical to box height */
  
  text-align: center;
  
  color: #D8E449;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    font-size: 18px;
    max-width: 50%;
    line-height: 25px;
  }
  `