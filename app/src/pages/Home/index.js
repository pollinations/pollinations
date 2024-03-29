import styled from "@emotion/styled"
import Hero from "./Hero"
import WhoWeAre, { ActivityUpdate, DarkLayout } from "./Layouts"
import Discord from './Discord'
import Dreamachine from './Dreamachine'
import MusicVideo from './MusicVideo'
import TwitchSection from "./DreamSection"
import { GenerativeImageFeed } from "./GenerativeImageFeed"
import PageTemplate from "../../components/PageTemplate"
import { ImageURLHeading } from "./styles"

export default function Solutions() {
  return <Style>
    <WhoWeAre />
    {/* <Hero /> */}
    <DarkLayout>
      <GenerativeImageFeed />
    </DarkLayout>
    <ImageURLHeading>Events</ImageURLHeading>

    <PageTemplate label='event' />
    <MusicVideo/>

    {/* <TwitchSection /> */}
    {/* <ActivityUpdate /> */}
    <Discord />
    {/* <Dreamachine /> */}
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

