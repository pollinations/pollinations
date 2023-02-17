import styled from '@emotion/styled'
import { Colors, Headline, MOBILE_BREAKPOINT } from '../../styles/global'
import { useNavigate } from 'react-router-dom'
import LetsTalkImg from '../../assets/imgs/letstalk.png'
import Star6Img from '../../assets/imgs/star_6.png'
import { Star as StarBase, LetsTalk as LetsTalkBase, Container as BaseContainer, DecorationIMG } from './components'
import CTA, { EmailCTA } from '../../components/CTA.js'
import { useState } from 'react'


// Decorations
const TopStar = styled(StarBase)`
top: 58px;
right: 86px;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  right: 12px;
  top: 29px;
}`;
const BottomStar = styled(StarBase)`
bottom: 69px;
left: 87px;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  left: 10px;
  bottom: 30px;
}`;
const LetsTalk = styled(LetsTalkBase)`
top: 71px;
right: 85px;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  right: 20px;
  top: 50px;
}`;

// Content
const CTAsContent = {
  mission: {
    title: <> We are on a mission to help <br/> people imagine new worlds with <br/> the help of AI. </>,
    cta_text: 'SEND A HELLO',
    cta_link: 'hello@pollinations.ai',
    cta_type: 'email',
    deco: <>
      <LetsTalk src={LetsTalkImg} />
      <BottomStar src={Star6Img} />
    </>
  },
  about: {
    title: <>
      Pollinations is a lively, collaborative <span> <i> ecosystem for AI-generated media. </i></span>
    </>,
    cta_text: 'ABOUT US',
    cta_link: '/about',
    cta_type: 'link',
    deco: <>
      <TopStar src={Star6Img} />
    </>
  }
}

const CTAs = ({ content, center }) => {

    const navigate = useNavigate()

    if (!content) throw new Error('CTAs component requires a content prop');

    const { title, cta_link, cta_text, cta_type, deco } = CTAsContent[content];

    return <Style>
    <Container center={center}>
      <HeadlineText textAlign={center ? 'center' : 'left'}>
        {title}
      </HeadlineText>
  
      { cta_type === 'link' ?
      <CTA outlined onClick={() => navigate(cta_link)}>
        {cta_text}
      </CTA>
      :
      <EmailCTA outlined {...CTAsContent[content]}>
        {cta_text}
      </EmailCTA>
      }
      {deco}

    </Container>
    </Style>
  }

export default CTAs;






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
    font-size: 46px;
    line-height: 56px;
    text-align: left;
    padding: 0 24px;
  }

  span {
    color: ${Colors.gray2};
  }
  `
  const Style = styled.div`
  width: 100%;
  height: 100%;
  background-color: ${Colors.lime};

  display: flex;
  justify-content: center;
  
  `

  const Container = styled(BaseContainer)`
  position: relative;
  width: 100%;
  min-height: 619px;

  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: ${props => props.center ? 'center' : 'flex-start'};

  padding: ${props => props.center ? '0' : '136px'};

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    height: 100%;
    min-height: 736px;
    padding: 8em 0;
  }
  `;

 