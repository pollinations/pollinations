import styled from '@emotion/styled';
import heroBG from '../../assets/imgs/bghero.jpg';
import heroBGOverlay from '../../assets/imgs/bgherooverlay.jpeg';
import { BackGroundImage, MOBILE_BREAKPOINT } from '../../styles/global';
// Hero Section

const Hero = props => {

    return <HeroGradient>
  
      <HeroHeadline>
        Create with AI
      </HeroHeadline>
      
  
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
  justify-content: flex-end;
  align-items: flex-start;

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
  height: auto;
  min-height: 100vh;

  `
  
  
  const HeroHeadline = styled.p`
  margin: 1.7em 0.5em 1.7em 1.2em;
  font-family: 'Leiko';
  font-style: normal;
  font-weight: 400;
  font-size: 64px;
  line-height: 82px;
  text-align: left;
  text-transform: uppercase;
  
  color: #FFFFFF;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    font-size: 58px;
    line-height: 60px;
  }
  
  `
  
  const HeroSubHeadLine = styled.p`
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 400;
  font-size: 26px;
  line-height: 34px;
  /* identical to box height */
  
  text-align: center;
  
  color: #D8E449;
  `