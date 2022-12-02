import styled from '@emotion/styled'
import { Colors, Headline, MOBILE_BREAKPOINT } from '../../styles/global'
import { useNavigate } from 'react-router-dom'
import LetsTalkImg from '../../assets/imgs/letstalk.png'
import Star6Img from '../../assets/imgs/star_6.png'

// Multiple platforms Section

const CTAs = props => {

    const navigate = useNavigate()

    return <Style>
  
      <HeadlineText>
        We are on a mission to help people imagine new worlds with the help of AI.
      </HeadlineText>
  
      <CTA variant='contained' onClick={() => navigate('/integrate')}>
        SEND A HELLO
      </CTA>

      <LetsTalk src={LetsTalkImg} />
      <Star6 src={Star6Img} />
  
    </Style>
  }

  export default CTAs;


  const HeadlineText = styled(Headline)`
  font-family: 'Uncut-Sans-Variable';
  font-style: normal;
  font-weight: 500;
  font-size: 56px;
  line-height: 68px;  
  text-align: center;
  color: ${Colors.offblack};  
  max-width: 56%;
  margin-bottom: 45px;
  z-index: 1;
  @media (max-width: ${MOBILE_BREAKPOINT}) {
    font-size: 40px;
  }
  `
  
  const CTA = styled.button`
    background: transparent;
    cursor: pointer;
    /* button */

    box-sizing: border-box;

    /* Auto layout */

    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    padding: 15px 30px;
    gap: 10px;


    /* gray 2 */

    border: 1px solid ${Colors.gray2};
    border-radius: 40px;

    font-family: 'Uncut-Sans-Variable';
    font-style: normal;
    font-weight: 700;
    font-size: 16px;
    line-height: 20px;  
  `
  const Style = styled.div`
  background-color: ${Colors.lime};
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  
  width: 100%;
  max-width: 100%;
  min-height: 619px;
  position: relative;
  `;

  const Star6 = styled.img`
  position: absolute;
  width: 77px;
  height: 77px;
  left: 87px;
  bottom: 69px;
  `;
  const LetsTalk = styled.img`
  position: absolute;
  width: 105px;
  height: 105px;
  top: 71px;
  right: 85px;
  `;