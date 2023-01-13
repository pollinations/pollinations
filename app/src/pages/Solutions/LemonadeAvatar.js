import styled from '@emotion/styled'
import { Colors, MOBILE_BREAKPOINT, Fonts } from '../../styles/global'
import LemonadeImgSrc from '../../assets/imgs/lemonade_avatar.png'

const LemonadeAvatar = props => {

    return <Style>
    
    <Container>
        <div>
            <TextItemTitle>
                Avatars
            </TextItemTitle>
            <TextItemBody>
                We are specializing in creating tools to generate avatars! Our Selfie-to-avatar creator is so much fun!           
            </TextItemBody>
        </div>
        <BotImg src={LemonadeImgSrc}/>
    </Container>
    </Style>
  }

export default LemonadeAvatar

const Style = styled.div`
width: 100%;
height: 100%;
position: relative;   
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