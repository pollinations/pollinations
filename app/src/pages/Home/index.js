import styled from "@emotion/styled"
import { BaseContainer } from "../../styles/global"

import Hero from "./Hero"
import TryOut from "./TryOut"
import CTAs from "./CTAs"
import FeaturedApps from "./FeaturedApp"
import PopulateMetaverses from "./Metaverses"
import DiscordSection from './Discord'

export default function Home() {
  return <Style>
    <Hero />
    <TryOut />
    <CTAs content='mission' center />
    <FeaturedApps />
    <PopulateMetaverses />
    <CTAs content='about'/>
    <DiscordSection />
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
`;

