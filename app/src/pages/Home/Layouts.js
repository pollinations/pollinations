import styled from '@emotion/styled';
import React from "react";
import { Colors, MOBILE_BREAKPOINT, HUGE_BREAKPOINT, BaseContainer } from '../../styles/global';
import { LinkStyle } from './components';

let WhoWeAreContent = () => <>
  <h2>
    We are a team of <i><b>machine-learning specialists</b>, <b>artists</b> and <b>futurists,</b></i>
    deeply engaged <br /> <i>in the <b>open source</b> AI ecosystem.</i>
  </h2>
  <p>
    To talk to us, reach out on <LinkStyle href="https://discord.gg/k9F7SyTgqn">Discord</LinkStyle> or at hello@pollinations.ai
  </p>
</>


export default function WhoWeAre() {
  return <Style>
    <PageLayout long={false}>
      <WhoWeAreContent />
    </PageLayout>
  </Style>
};


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
  margin-top: 0.5em;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    font-size: 36px;
    line-height: 40px;
    margin-bottom: 1em;
    margin-top: 0em;
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
