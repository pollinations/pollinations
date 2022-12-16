import { getCurrentUser } from '../../supabase/user'
import Chart from './chart'
import styled from '@emotion/styled'
import { BackGroundImage, Colors, Fonts, MOBILE_BREAKPOINT } from '../../styles/global';
import whyBG from '../../assets/imgs/BG7.png'


export default function DashBoard(){


    return <Style>
        <Headline>
        Usage
      </Headline>
     <Chart/>
     <BackGroundImage 
        src={whyBG} 
        top='auto'
        zIndex='-1' 
        objectPosition='0 30%'
        alt="hero_bg_overlay" />
    </Style>
}
const Style = styled.div`
width: 100%;
height: 100%;
padding: 0em;
margin: 0;
display: flex;
flex-direction: column;
align-items: flex-start;
justify-content: flex-start;
`;
const Headline = styled.p`
font-family: ${Fonts.body};
font-style: normal;
font-weight: 400;
font-size: 45px;
line-height: 40px;
text-transform: capitalize;
margin: 0;
color: ${Colors.offWhite};
margin-top: 2em;
margin-bottom: 0;
margin-left: 5%;

span {
  font-family: ${Fonts.headline};
  color: ${Colors.lime};
}

@media (max-width: ${MOBILE_BREAKPOINT}) {
  font-size: 56px;
  line-height: 62px;
}`;