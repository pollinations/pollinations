import styled from '@emotion/styled'
import { Colors, Fonts, Headline, MOBILE_BREAKPOINT } from '../../styles/global'
import LetsTalkImg from '../../assets/imgs/letstalklime.png'
import { LetsTalk as LetsTalkBase, Container as BaseContainer } from './components'
import  { EmailCTA } from '../../components/CTA.js'


// Decorations
const LetsTalk = styled(LetsTalkBase)`
top: 71px;
right: 85px;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  right: 20px;
  top: 50px;
}`;

const CTA = () => {
  return <Container>
    <HeadlineText>
      How will your company <br/> leverage AI creation? 
      <br/>
      <br/>
    </HeadlineText>

    <CTAContainer>
      <HeadlineText>
        <span> 
          <i>
          Tell us about your idea  
          </i> 
        </span>
      </HeadlineText>
      <div>
        <EmailCTA outlined light 
          cta_text='REACH OUT'
          cta_link='hello@pollinations.ai'
          cta_type='email'/>
      </div>
    </CTAContainer>
    
    <LetsTalk src={LetsTalkImg} />

  </Container>
}

export default CTA;


const CTAContainer = styled.div`
display: flex;
align-items: center;
gap: 3em;
flex-wrap: wrap;
@media (max-width: ${MOBILE_BREAKPOINT}) {
justify-content: center;
}
`

const HeadlineText = styled(Headline)`
font-family: ${Fonts.body};
font-style: normal;
font-weight: 500;
font-size: 56px;
line-height: 68px;
color: ${Colors.offwhite};
margin: 0; 
text-align: left;
z-index: 1;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  font-size: 46px;
  line-height: 56px;
  padding: 0 24px;
  text-align: center;
}
span {
  color: ${Colors.lime};
}
`
const Container = styled(BaseContainer)`
position: relative;
width: 100%;
min-height: 90vh;
display: flex;
flex-direction: column;
align-items: flex-start;
justify-content: center;
padding: ${props => props.center ? '0' : '136px'};

@media (max-width: ${MOBILE_BREAKPOINT}) {
  align-items: center;
  height: 100%;
  min-height: 736px;
  padding: 8em 0;
}
`;

 