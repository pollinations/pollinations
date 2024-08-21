import styled from '@emotion/styled'
import Star6Img from '../../assets/imgs/star_6.png'
import { useMemo } from 'react'

import { Colors, MOBILE_BREAKPOINT, Fonts } from '../../styles/global'
import { Star as StarBase, LinkStyle, Container as ContainerBase } from './components'
import { Link } from 'react-router-dom'

const DiscordSection = props => {
  const discordLogoPrompt = encodeURIComponent("Create a black and white logo with text to the right. occupying all image featuring the \"Discord\" logo with the text \"Discord\" in a modern, sans-serif font. The font should be clean, rounded, and bold, giving it a friendly and approachable look. The logo should include the iconic Discord emblem—a simplified, abstract face with two eyes and a wide mouth—placed to the left of the text. The emblem and text should both be in a dark, almost black color, set against a white or light background, ensuring the design is clear and visually cohesive. The overall style should convey a sense of modernity and connectivity.black and white");
  const seed = useMemo(() => Math.floor(Math.random() * 10), []);
  const discordLogoUrl = `https://image.pollinations.ai/prompt/${discordLogoPrompt}?seed=${seed}&width=500&height=150`;

  return <Style>
    <Container>
      <Link to="https://discord.gg/k9F7SyTgqn'"><DiscordLogo src={discordLogoUrl} alt="discord" /></Link>
      <Body>

        Discuss, get help and <br />
        contribute on Discord.
        <br />
        <br />
        <LinkStyle href='https://discord.gg/k9F7SyTgqn' style={{ zIndex: 10 }}>
          join our discord
        </LinkStyle>
      </Body>
      <Star src={Star6Img} />
    </Container>
  </Style>
}

export default DiscordSection


const Style = styled.div`
width: 100%;
height: 100%;
position: relative;
background-color: ${Colors.offwhite};

display: flex;
justify-content: center;
align-items: center;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  min-height: 674px;
}
`
const Container = styled(ContainerBase)`
position: relative;
min-height: 551px;
width: 100%;
height: 100%;

display: flex;
flex-wrap: wrap;
flex-direction: row;
justify-content: center;
align-items: center;
gap: 100px;

@media (max-width: ${MOBILE_BREAKPOINT}) {
  flex-direction: column;
  gap: 10px;
}
`

const DiscordLogo = styled.img`
width: 100%;
max-width: 500px;
height: auto;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  max-width: 260px;
  margin-top: 10em;
}
`

const Star = styled(StarBase)`
width: 60px;
height: 60px;
top: 88px;
left: 50%;
transform: translateX(-50%);
`

const Body = styled.p`
margin-top: 3em;
font-family: ${Fonts.body};
font-style: normal;
font-weight: 500;
font-size: 40px;
line-height: 50px;

color: ${Colors.offblack};

@media (max-width: ${MOBILE_BREAKPOINT}) {
  font-size: 36px;
  line-height: 45px;
  margin: 0;
  margin-top: 60px;
}
`;