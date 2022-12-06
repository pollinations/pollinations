import styled from "@emotion/styled"
import { BaseContainer } from "../../styles/global"

import Hero from "./Hero"
import TryOut from "./TryOut"
import CTAs from "./CTAs"
import FeaturedApps from "./FeaturedApp"
import PopulateMetaverses from "./Metaverses"
import DiscordSection from './Discord'

export default function Home() {
  return <HomeStyle>
    <Hero />
    <TryOut />
    <CTAs content='mission' />
    <FeaturedApps />
    <PopulateMetaverses />
    <CTAs content='about'/>
    <DiscordSection />
  </HomeStyle>
}

const HomeStyle = styled(BaseContainer)`
padding: 0em;
display: flex;
width: 100%;
flex-direction: column;
align-items: center;
justify-content: center;
`;

