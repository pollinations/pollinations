import styled from '@emotion/styled';
import React from "react";
import CreateButtonBase from '../../components/atoms/CreateButton';
import { MediaViewer } from '../../components/MediaViewer';
import { getMedia } from '../../data/media';
import { Colors, Fonts, GlobalSidePadding, MOBILE_BREAKPOINT } from '../../styles/global';
import TopBandPresetsDesign from '../../assets/imgs/presets-linha.png'
import { BackgroundImage } from './components';


let WhoWeAreContent = () => <>

      <h2>
        We area team of <i><b> data scientists, machine-learning specialists, artists and futurists </b></i> 
        profoundly involved <br/> <i><b> in the AI ecosystem.</b></i>
      </h2>
      <p>
        We combine the strengths of different models and fine-tune the code to get specific results. 
       <br/> <br/>
        To talk to us, reach out on Discord or at hello@pollinations.ai
      </p>


</>

let ActivityUpdateContent = () => <>
      <h2>
      <i><b> Pollinations activity update! </b></i>
      </h2>
      <p>
      The Explore page is no longer available, although we had a great time with it, it's time to move forward. 
      <br/> However, the same AI models are <i><b> still accessible for free</b></i> on our Discord channels.
      <br/> From now on Pollinations will redirect its focus on AI music video creation, and an exciting real-time immersive AI product called the Dreamachine which will be launched very soon.
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


const Headline = styled.p`
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
`
const BodyText = styled.p`
width: 37%;
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

`

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
z-index: 0;

display: flex;
justify-content: center;
align-items: center;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  min-height: 674px;
}






`