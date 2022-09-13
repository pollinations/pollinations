import styled from '@emotion/styled'
import { BackGroundImage, Headline, MOBILE_BREAKPOINT } from '../../styles/global'
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
  
      <CTA variant='contained' onClick={() => navigate('/solutions')}>
        How it works
      </CTA>
      <Flying3d left src='/3dobjects/a-castle-made-of-cheesecake-1--unscreen-min.gif'/>
      <Flying3d src='/3dobjects/An-Alien-with-a-Planet-for-a-H-unscreen-min.gif'/>
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
  bottom: -40px;
  left: 0;` : `
  top: -200px;
  right: 0px;`
  };
  @media (max-width: ${MOBILE_BREAKPOINT}) {
    ${props => props.left ? `
`: `
  display: none;
  `}
  z-index: 0;
  }
  `

  const HeadlineOnTop = styled(Headline)`
  font-family: 'DM Sans';
  font-size: 60px;
  z-index: 1;
  `
  
  const MultiplePlatformsSubHeadline = styled.p`
  width: 46%;
  max-width: 640px;
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 400;
  font-size: 23px;
  line-height: 35px;
  color: #FFFFFF;
  text-align: center;
  z-index:3;
  @media (max-width: ${MOBILE_BREAKPOINT}) {
    width: 90%;
  }
  `
  const CTA = styled.button`
  z-index: 1;
  background: rgb(233, 250, 41);
  border-radius: 40px;
  padding: 1em 2em;
  border: none;
  margin-top: 5em;
  margin-bottom: 5em;
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
  max-width: 100%;
  min-height: 100vh;
  position: relative;


  `;