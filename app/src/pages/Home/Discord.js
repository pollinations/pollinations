import styled from '@emotion/styled'
import DiscordIMG from '../../assets/imgs/discord_black.png'
import Star6Img from '../../assets/imgs/star_6.png'

import { Colors, MOBILE_BREAKPOINT, Fonts } from '../../styles/global'
import { Star as StarBase, LinkStyle, Container as ContainerBase } from './components'
import { Link } from 'react-router-dom'

const DiscordSection = props => {

    return <Style>
    <Container>
      <Link to="https://discord.gg/8HqSRhJVxn'"><DiscordLogo src={DiscordIMG} alt="discord"  /></Link>
      <Body>
        Discuss, get help and <br/>
        contribute on Discord.
        <br/>
        <br/>
        <LinkStyle href='https://discord.gg/8HqSRhJVxn' style={{zIndex: 10}}>
            join our discord
        </LinkStyle>
      </Body>
      <Star src={Star6Img}/>
    </Container>
  </Style>
}

export default DiscordSection


const Style = styled.div`
width: 100%;
height: 100%;
position: relative;
background-color: ${Colors.lime};

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
max-width: 291px;
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