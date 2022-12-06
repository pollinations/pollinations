import styled from '@emotion/styled'
import { useNavigate } from 'react-router-dom'
import DiscordIMG from '../../assets/imgs/discord_black.png'
import Star6Img from '../../assets/imgs/star_6.png'
import DiscordBG from '../../assets/imgs/discord_bg.png'

import { Colors, MOBILE_BREAKPOINT, BackGroundImage } from '../../styles/global'
import { Star, LinkStyle, Container } from './components'

const DiscordSection = props => {

    return <Style>
    <GridTwoColumns alignItems='center'>
        <DiscordLogo src={DiscordIMG} alt="discord"  />
        <Body>
        Discuss, get help and <br/>
        contribute on Discord.
        <br/>
        <br/>
        <LinkStyle href='https://discord.gg/8HqSRhJVxn'>
            join our discord
        </LinkStyle>
        </Body>
        <StarCenter src={Star6Img}/>
    </GridTwoColumns>
    <BackGroundImage 
    zIndex='-1'
    src={DiscordBG} 
    alt="discord_bg" />
  </Style>
}

export default DiscordSection
const Style = styled.div`
display: flex;
justify-content: center;
width: 100%;
position: relative;
`

const DiscordLogo = styled.img`
max-width: 291px;
margin: 0 auto;
`

const StarCenter = styled(Star)`
width: 60px;
height: 60px;
top: 10%;
left: 50%;
transform: translateX(-50%);
`

const Body = styled.p`
font-family: 'Uncut Sans';
font-style: normal;
font-weight: 500;
font-size: 40px;
line-height: 50px;

color: ${Colors.offblack};

@media (max-width: ${MOBILE_BREAKPOINT}) {
  font-size: 40px;
  line-height: 40px;
}
`
  
const GridTwoColumns = styled(Container)`


min-height: 551px;
display: grid;
gap: 5em;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));

@media (max-width: ${MOBILE_BREAKPOINT}) {
  padding: 10em 1.5em;
}
`