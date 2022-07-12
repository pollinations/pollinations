import styled from '@emotion/styled'
import { BackGroundImage, Headline } from '../../styles/global'
import heroBGOverlay from '../../assets/imgs/bgherooverlay.jpeg'

import { useNavigate } from 'react-router-dom'
// Multiple platforms Section

const MultiplePlatforms = props => {

    const navigate = useNavigate()

    return <MultiplePlatformsStyle>
  
      <HeadlineOnTop>
        Multiple platforms
      </HeadlineOnTop>
  
      <MultiplePlatformsSubHeadline>
        Platforms for music, NFTs, media outlets, 
        visual design and more are adding a touch 
        of magic to their business by integrating with Pollinations’ API.
      </MultiplePlatformsSubHeadline>
  
      <CTA variant='contained' onClick={() => navigate('/about')}>
        How it works
      </CTA>
      <Flying3d left src='/3dobjects/a-castle-made-of-cheesecake-1--unscreen.gif'/>
      <Flying3d src='/3dobjects/An-Alien-with-a-Planet-for-a-H-unscreen.gif'/>
      <BackGroundImage 
        src={heroBGOverlay} 
        top='auto'
        zIndex='-1' 
        transform='rotate(-180deg)' 
        alt="hero_bg_overlay" />
  
    </MultiplePlatformsStyle>
  }

  export default MultiplePlatforms

  const Flying3d = styled.img`
  position: absolute;
  ${props => props.left ? `
  bottom: -50px;
  left: 0;` : `
  top: -50px;
  right: -50px;`
  };
  z-index: 0;
  `

  const HeadlineOnTop = styled(Headline)`
  z-index: 1;
  `
  
  const MultiplePlatformsSubHeadline = styled.p`
  width: 85%;
  max-width: 640px;
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 400;
  font-size: 24px;
  line-height: 32px;
  color: #FFFFFF;
  `
  const CTA = styled.button`
  z-index: 1;
  background: #D8E449;
  border-radius: 40px;
  padding: 0.8em 1.2em;
  border: none;
  margin-top: 5em;

  cursor: pointer;
  
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 700;
  font-size: 16px;
  line-height: 21px;
  /* identical to box height */
  
  display: flex;
  align-items: center;
  text-align: center;
  text-transform: uppercase;
  
  color: #040405;
  `
  const MultiplePlatformsStyle = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  
  width: 100%;
  min-height: 100vh;
  position: relative;

  `;