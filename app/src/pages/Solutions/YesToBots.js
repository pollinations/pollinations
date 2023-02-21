import styled from '@emotion/styled'
import { Colors, MOBILE_BREAKPOINT, Fonts } from '../../styles/global'
import { BackgroundImage, Container as ContainerBase } from './components'
import BotsBG from '../../assets/imgs/avatares-background.png'
import GradientBG from '../../assets/imgs/Rectangle-Gradient-Bots.png'

import BotIMGSrc from '../../assets/imgs/bots-post.png'

const Bots = props => {

    return <Style>
    
    <Container>
        <div>
            <TextItemTitle>
                Not all bots are bad 
            </TextItemTitle>
            <TextItemBody>
                Busy Bee is a bot that spreads joy, it can be implemented into any social media, such as Twitter or Discord, allowing users to create media without switching platforms.        
            </TextItemBody>
        </div>
        <BotImg src={BotIMGSrc}/>
    </Container>

    <BackgroundImage 
        src={BotsBG} 
        zIndex='-2' 
        alt="bots_bg" />
    <BackgroundImage 
        src={GradientBG} 
        zIndex='-1' 
        alt="gradient_bg" />
    </Style>
  }

export default Bots

const Style = styled.div`
width: 100%;
height: 100%;
position: relative;   
min-height: 150vh;
`
const Container = styled.div`
padding: 86px;
margin-bottom: 10em;
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
flex-wrap: wrap;
`
const BotImg = styled.img`
height: 392px;
width: auto;
justify-self: center;
`
const TextItemTitle = styled.p`
font-family: ${Fonts.body};
font-style: normal;
font-weight: 500;
font-size: 28px;
line-height: 35px;

color: ${Colors.background_body};
`
const TextItemBody = styled.p`
width: 100%;
font-family: ${Fonts.body};
font-style: normal;
font-weight: 400;
font-size: 22px;
line-height: 30px;
margin: 0;

color: ${Colors.gray1};
@media (max-width: ${MOBILE_BREAKPOINT}) {
    width: auto;
    margin-bottom: 2em;
  }
`