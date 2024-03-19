import styled from '@emotion/styled';
import React from "react";
import { Colors, MOBILE_BREAKPOINT, HUGE_BREAKPOINT, BaseContainer } from '../../styles/global';
import TopBandPresetsDesign from '../../assets/imgs/presets-linha.png'
import { BackgroundImage, LinkStyle } from './components';
import { Link } from 'react-router-dom';


let WhoWeAreContent = () => <>
    <h2>
      We are a team of <i><b> data scientists, machine-learning specialists, artists and futurists </b></i> 
      profoundly involved <br/> <i><b> in the AI ecosystem.</b></i>
    </h2>
    <p>
      To talk to us, reach out on <LinkStyle to="https://discord.com/invite/8HqSRhJVxn">Discord</LinkStyle> or at hello@pollinations.ai
    </p>
</>

let ActivityUpdateContent = () => <>
    <h2>
      <b> Pollinations activity update! </b>
    </h2>
    <p>
      The Explore page is no longer available, although we had a great time with it, it's time to move forward. 
      <br/><br/> However, we have migrated models to <a href="https://replicate.com/pollinations"> Replicate</a> and are still maintaining the <b><i>Generative Image URL</i></b> which is primarily being used in combination with ChatGPT.
      <br/><br/> From now on Pollinations will redirect its focus on AI music video creation, and an exciting real-time immersive AI product called the Dreamachine which will be launched very soon.
      <br/><br/>
      <i><b>Stay tuned!</b></i>
    </p>  
</>







export default function WhoWeAre() {
  return <Style>
    <TopBand src={TopBandPresetsDesign}/>
    <PageLayout long={false}>
      <WhoWeAreContent />
    </PageLayout>
    <BackgroundImage 
      src='gradient_background.png'
      zIndex='-2' 
      role='presentation'
      alt="hero_bg" />
  </Style>
};

export function ActivityUpdate(){
  return <Style dark={true}>
    <PageLayout long={true} dark={true}>
      <ActivityUpdateContent />
    </PageLayout>
  </Style> 
}



export function DarkLayout({children, style}){
  return <Style dark={true} style={style}>
    <PageLayout long={true} dark={true} style={{alignItems:"center"}}>
      {children}
    </PageLayout>
  </Style> 
}


const TopBand = styled.img`
position: absolute;
width: 100%;
height: auto;
right: 0;
bottom: 0;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  width: auto;
  height: 59px;
}`;

// STYLES
const PageLayout = styled(BaseContainer)`
width: 100%;

display: flex;
flex-direction: column;
align-items: flex-start;
justify-content: center;
gap: 1em;
padding: 7%;
margin: auto;

@media (max-width: ${MOBILE_BREAKPOINT}) {
  padding: 8em 5%;
}
h2 {
  initial: unset;
  font-family: 'Uncut-Sans-Variable';
  font-style: normal;
  font-weight: 500;
  font-size: 46px;
  line-height: 58px;

  color: ${props => props.dark ? Colors.offwhite : Colors.offblack};
  margin: 0;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    font-size: 36px;
    line-height: 40px;
    margin-bottom: 1em;
  }
}
p {
  width: ${props => props.long || '37%'};
  font-family: 'Uncut-Sans-Variable';
  font-style: normal;
  font-weight: 400;
  font-size: 24px;
  line-height: 34px;
  color: ${props => props.dark ? Colors.offwhite : Colors.offblack};
  margin: 0;
  i {
    color: ${props => props.dark ? Colors.accent : Colors.offblack};
  }
  @media (max-width: ${MOBILE_BREAKPOINT}) {
    width: 90%;
    font-size: 22px;
  }
}
`;

const Style = styled.div`
width: 100%;
position: relative;
background-color: ${props => props.dark ? 'black' : Colors.background_body};

@media (max-width: ${MOBILE_BREAKPOINT}) {

}
`
