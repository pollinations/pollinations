import styled from "@emotion/styled"
import Hero from "./Hero"
import LayoutLight01, { LaytoutDark01 } from "./Layouts"
import Discord from './Discord'
import Dreamachine from './Dreamachine'
import MusicVideo from './MusicVideo'

export default function Solutions() {
  return <Style>
    <Hero />
    <LaytoutDark01 long id='activityupdate'  />
    {/* <Dreamachine /> */}
    {/* <MusicVideo /> */}
    <LayoutLight01 id='whoweare'/>
    <Discord />
  </Style>
}
const Style = styled.div`
width: 100%;
padding: 0em;
margin: 0;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
input:focus, textarea:focus, select:focus{
  outline: none;
}
`;

