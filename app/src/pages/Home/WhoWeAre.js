import styled from '@emotion/styled';
import React from "react";
import { Colors, MOBILE_BREAKPOINT } from '../../styles/global';
import TopBandPresetsDesign from '../../assets/imgs/presets-linha.png'
import { BackgroundImage } from './components';
import { Link } from "react-router-dom"

let WhoWeAreContent = () => <>

      <h2>
        We are a team of <i><b> data scientists, machine-learning specialists, artists and futurists </b></i> 
        profoundly involved <br/> <i><b> in the AI ecosystem.</b></i>
      </h2>
      <p>
        To talk to us, reach out on Discord or at hello@pollinations.ai
      </p>


</>

let ActivityUpdateContent = () => <>
      <h2>
      <i><b> Pollinations activity update! </b></i>
      </h2>
      <p>
The Explore page has been removed. Our current focus is on AI music video creation and the Dreamachine. However, you can still access our AI models via our <Link style={{color: "black"}} href="https://www.github.com/pollinations">Discord bots</Link> and on <Link style={{color: "black"}} href="https://replicate.com/pollinations">Replicate</Link>.
      <br/>
      <br/> From now on Pollinations will redirect its focus on AI music video creation, and the real-time immersive AI product called the Dreamachine.
      <br/><br/>
      <i><b>Stay tuned!</b></i>
      </p>
</>





export default function LayoutLight01({ id, long }) {

  let content = {
    'whoweare': <WhoWeAreContent/>,
    'activityupdate': <ActivityUpdateContent/>
  }
  
  return <Style>
    <TopBand src={TopBandPresetsDesign}/>
    <PageLayout long={long}>
      {id ? content[id] : <></>}
    </PageLayout>
    <BackgroundImage 
    src='gradient_background.png'
    zIndex='-2' 
    alt="hero_bg" />
  </Style>
};

const TopBand = styled.img`
position: absolute;
width: 100%;
height: auto;
right: 0;
top: 0;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  width: auto;
  height: 59px;
}`;

// STYLES
const PageLayout = styled.div`
width: 100%;
max-width: 1440px;
min-height:80vh;

margin-top: 2em;
display: flex;
flex-direction: column;
align-items: flex-start;
justify-content: center;
gap: 46px;
padding: 7%;


@media (max-width: ${MOBILE_BREAKPOINT}) {
  margin-top: 5em;

  .MuiStepper-horizontal {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 0.3em !important;
  }
}
h2 {
  initial: unset;
  font-family: 'Uncut-Sans-Variable';
  font-style: normal;
  font-weight: 500;
  font-size: 46px;
  line-height: 58px;

  color: ${Colors.offblack};
  margin: 0;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    max-width: 90%;
    font-size: 46px;
    line-height: 50px;
  }
}
p {
  initial: unset;
  width: ${props => props.long || '37%'};
  font-family: 'Uncut-Sans-Variable';
  font-style: normal;
  font-weight: 400;
  font-size: 24px;
  line-height: 34px;
  color: ${Colors.offblack};
  margin: 0;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    width: 90%;
  }
}
`;

const Style = styled.div`
width: 100%;
height: 100%;
position: relative;
background-color: ${Colors.background_body};

display: flex;
justify-content: center;
align-items: center;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  min-height: 674px;
}
`
