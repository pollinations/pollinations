import styled from '@emotion/styled'
import { Colors, Headline, MOBILE_BREAKPOINT } from '../../styles/global'
import { useNavigate } from 'react-router-dom'
import LetsTalkImg from '../../assets/imgs/letstalk.png'
import Star6Img from '../../assets/imgs/star_6.png'
import { CTA, Star, LetsTalk, Container } from './components'




const CTAs = ({ content }) => {

    const navigate = useNavigate()

    if (!content) throw new Error('CTAs component requires a content prop');

    return <Style content={content}>
      <Container>
      <HeadlineText textAlign={content === 'about' && 'left'}>
        {CTAsContent[content].title}
      </HeadlineText>
  
      <CTA outlined onClick={() => navigate('/integrate')}>
        {CTAsContent[content].cta}
      </CTA>

      {CTAsContent[content].deco}
      </Container>
    </Style>
  }

export default CTAs;

const CTAsContent = {
  mission: {
    title: <> We are on a mission to help <br/> people imagine new worlds with <br/> the help of AI. </>,
    cta: 'SEND A HELLO',
    deco: <>
      <LetsTalk src={LetsTalkImg} />
      <Star src={Star6Img} />
    </>
  },
  about: {
    title: <>
      Pollinations is a lively, collaborative <span> <i> ecosystem for AI-generated media. </i></span>
      We are crafting a web3 valueflow to host and reward the open-source community.
    </>,
    cta: 'ABOUT US',
    deco: <>
      <Star Top src={Star6Img} />
    </>
  }
}

const HeadlineText = styled(Headline)`
  font-family: 'Uncut-Sans-Variable';
  font-style: normal;
  font-weight: 500;
  font-size: 56px;
  line-height: 68px;  
  text-align: ${props => props.textAlign || 'center'};
  color: ${Colors.offblack};  
  max-width: 970px;
  margin-bottom: 45px;
  z-index: 1;
  @media (max-width: ${MOBILE_BREAKPOINT}) {
    font-size: 40px;
  }

  span {
    color: ${Colors.gray2};
  }
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

  const ContainerMod = styled(Container)`
  ${props => props.content === 'about' && 'padding: 9%; align-items: flex-start;'}
  `