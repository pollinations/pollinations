import styled from '@emotion/styled'
import { BackGroundImage, MOBILE_BREAKPOINT } from '../../styles/global'
import whyBG from '../../assets/imgs/new_bg_sections.jpg'

const TempLayout = ({ Content }) => {
  
    return <Style>
      {
        Content.map( item =>
          <GridTwoColumns>
            <div >
              <Headline>
                {item.headline}
              </Headline>
            </div>
            <div>
              <ExplanationText>
                {item.content}
              </ExplanationText>
            </div>
          </GridTwoColumns>
        )
      }
  
      <BackGroundImage 
          src={whyBG} 
          top='auto'
          transform='scaleX(-1)'
          zIndex='-1' 
          alt="hero_bg_overlay" />
    
    </Style>
  }

export default TempLayout

const Headline = styled.p`
font-family: 'DM Sans';
font-style: normal;
font-weight: 400;
font-size: 56px;
line-height: 73px;
color: #000000;
margin-top: 0;

span {
  font-weight: 700;
  font-size: 24px;
  line-height: 31px;
  margin: 0;
  color: #ffffff;
}
`
const ExplanationText = styled.p`
font-family: 'DM Sans';
font-style: normal;
font-weight: 400;
font-size: 24px;
line-height: 31px;
color: #191919;

margin-top: 5em;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  margin-top: 1em;
}
`
  
const GridTwoColumns = styled.div`
width: 100%;
max-width: 1280px;
padding: 10em 4em;
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
align-items: flex-start;
`
const Style = styled.div`
display: flex;
flex-direction: column;
align-items: center;

width: 100%;
position: relative;
`;