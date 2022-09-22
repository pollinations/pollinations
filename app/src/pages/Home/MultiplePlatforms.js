import styled from '@emotion/styled'
import { Headline, MOBILE_BREAKPOINT } from '../../styles/global'
import { useNavigate } from 'react-router-dom'

// Multiple platforms Section

const MultiplePlatforms = props => {

    const navigate = useNavigate()

    return <MultiplePlatformsStyle>
  
      <HeadlineOnTop>
        Multiple platforms
      </HeadlineOnTop>
  
      <MultiplePlatformsSubHeadline>
        The digital asset market is growing every year. <br/>
        Companies in music, games, NFTs and design are 
        adding value to their businesses by integrating 
        AI creation into their plan.
      </MultiplePlatformsSubHeadline>
  
      <CTA variant='contained' onClick={() => navigate('/integrate')}>
        How it works
      </CTA>
  
    </MultiplePlatformsStyle>
  }

  export default MultiplePlatforms


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