import styled from '@emotion/styled';
import { Colors, Fonts, MOBILE_BREAKPOINT } from '../styles/global'
import Star from '../assets/imgs/pollenprograss/Star3.png'
import Arrows from '../assets/imgs/pollenprograss/arrows.png'
import {getPollenStatus} from './PollenStatus'

const PollenProgress = ({ log }) => {

    const { pollenStatuses } = getPollenStatus(log)
    console.log(pollenStatuses)

    return <StepsContainer>
  
      <StepTitle color={StepTitleColors['done']}>
        Connecting
      </StepTitle>
  
      <img src={Star} style={{width: 25, height: 25}} alt='decoration_star' />
  
      <StepTitle color={StepTitleColors[(pollenStatuses?.length < 1) ? 'active' : 'done']  }>
        Pimping
      </StepTitle>
  
      <img src={Arrows} style={{width: 32, height: 14}} alt='decoration_star' />

      <StepTitle color={StepTitleColors[(pollenStatuses?.length > 1) ? 'active' : 'waiting']  }>
        Generating
      </StepTitle>
  
    </StepsContainer>
  }
  
  const StepTitleColors = {
    'active': Colors.magenta,
    'done': Colors.wine,
    'waiting': Colors.gray4
  }
  
  const StepsContainer = styled.div`
  max-width: 574px;
  width: 100%;
  
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  @media (max-width: ${MOBILE_BREAKPOINT}) {
      max-width: 192px;
    }
  `
  
  const StepTitle = styled.p`
  font-family: ${Fonts.body};
  font-style: normal;
  font-weight: 500;
  font-size: 22px;
  line-height: 28px;
  
  color: ${props => props.color || Colors.gray4 };
  `
  

  export default PollenProgress