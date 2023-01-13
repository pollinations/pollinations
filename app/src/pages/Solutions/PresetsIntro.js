import styled from '@emotion/styled';
import React from "react";
import CreateButtonBase from '../../components/atoms/CreateButton';
import { MediaViewer } from '../../components/MediaViewer';
import { getMedia } from '../../data/media';
import { Colors, Fonts, GlobalSidePadding, MOBILE_BREAKPOINT } from '../../styles/global';
import TopBandPresetsDesign from '../../assets/imgs/presets-linha.png'


export default function PresetsIntro() {

  return <Style>
    <TopBand src={TopBandPresetsDesign}/>
    <PageLayout >

      <Headline>
        <i><b>AI models</b></i> are often focused on one task and like <br/> humans <i><b>have unique strengths and weaknesses.</b></i>
      </Headline>
      <BodyText>
        We develop tools that combine the strengths of different models and fine-tune the code to get specific results. 
        <br/> <br/>
        Forget about the hustle of prompt engineering or tweaking endless lists of parameters.
      </BodyText>


      
    </PageLayout>
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
background-color: ${Colors.background_body};

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