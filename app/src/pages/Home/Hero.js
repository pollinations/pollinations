import styled from '@emotion/styled'
import { BackGroundImage } from '../../styles/global';
import heroBG from '../../assets/imgs/bghero.jpg'
import heroBGOverlay from '../../assets/imgs/bgherooverlay.jpeg'
// Hero Section

const Hero = props => {

    return <HeroGradient>
  
      <HeroHeadline>
        Create all kinds of <br/> media with AI power
      </HeroHeadline>
      
  
      <BackGroundImage 
        src={heroBGOverlay} 
        zIndex='-1' 
        opacity='68%' 
        blend='screen' 
        transform='rotate(-180deg)' 
        alt="hero_bg_overlay" />
      
      <BackGroundImage 
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
  `
  
  
  
  const HeroHeadline = styled.p`
  margin: 0;
  font-family: 'Leiko';
  font-style: normal;
  font-weight: 400;
  font-size: 64px;
  line-height: 82px;
  text-align: center;
  text-transform: uppercase;
  
  color: #FFFFFF;
  `
  
 