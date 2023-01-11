import styled from '@emotion/styled'
import { Colors, MOBILE_BREAKPOINT, Fonts } from '../../styles/global'
import { useNavigate } from 'react-router-dom'
import CTA, { EmailCTA } from '../../components/CTA'
import { BackgroundImage, Container as ContainerBase } from './components'
import GradientBG from '../../assets/imgs/increase-gradient-background.png'
import Icons from '../../assets/imgs/nft-series/nft-series'

const Increase = props => {

    const navigate = useNavigate()

    return <Style>
    
    <IntegrateStyle>
        <Title>
            Increase engagement and build <span><i>a strong hive.</i></span> 
        </Title>
        <TextItem/>
    </IntegrateStyle>

    <BackgroundImage 
        transform='rotateZ(180deg)'
        src={GradientBG} 
        zIndex='-1' 
        alt="hero_bg" />
    </Style>
  }

  export default Increase

const Style = styled.div`
    width: 100%;
    height: 100%;
    position: relative;   
    min-height: 120vh;
`


const TextItem = () => {


    return <>
        <TextItemTitle>
            NFT Series 
        </TextItemTitle>
        <TextItemBody>
            Creating NFT series was never that easy. Find your astethetic and we deliver a tool to create unlimited, unique, roylities free images matching your vision.
        </TextItemBody>
        <AvatarImgsDesktop/>
        <AvatarImgsMobile/>
    </>
}

function AvatarImgsMobile(){
    return <AvatarStyleMobile>
        {
            Icons.map(avatar => <AvatarIMG src={avatar} />)
        }
    </AvatarStyleMobile>
}
const AvatarStyleMobile = styled.div`
margin-top: 5em;
width: 100%;
display: flex;
flex-direction: column;
align-items: center;
gap: 2em;
@media (min-width: ${MOBILE_BREAKPOINT}) {
display: none;
}

`


function AvatarImgsDesktop(){

    const margins = [
        '0',
        '20',
        '0',
        '40',
        '60',
        '0',
    ]
    
    return <AvatarContainer>
        
    <IntegrateListStyle>
        <div/>
        {
            Icons.map( (icon, idx) => <AvatarIMG src={icon} style={{marginTop: margins[idx]}}/>
            )
        }
    </IntegrateListStyle>
    </AvatarContainer>
}
const AvatarContainer = styled.div`
position: absolute;
right: 10em;
bottom: 5em;
display: flex;
@media (max-width: ${MOBILE_BREAKPOINT}) {
display: none;
}
`
const IntegrateListStyle = styled.div`
display: grid;
grid-template-columns: 1fr 1fr 1fr;
grid-column-gap: 26px;
@media (max-width: ${MOBILE_BREAKPOINT}) {
    grid-column-gap: 0px;
}
margin-bottom: 5em;

`
const AvatarIMG = styled.img`
width: 225px;
height: auto;
`



const IntegrateStyle = styled.div`
padding: 86px;
margin-bottom: 10em;
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
width: 30%;
font-family: ${Fonts.body};
font-style: normal;
font-weight: 400;
font-size: 22px;
line-height: 30px;
margin: 0;

color: ${Colors.gray1};
@media (max-width: ${MOBILE_BREAKPOINT}) {
    width: auto;
  }
`

const Title = styled.p`
width: 50%;
font-family: ${Fonts.body};
font-style: normal;
font-weight: 500;
font-size: 46px;
line-height: 56px;

text-transform: uppercase;

color: ${Colors.offwhite};
span {
    color: ${Colors.lime};
}
@media (max-width: ${MOBILE_BREAKPOINT}) {
width: 100%;
}
`

