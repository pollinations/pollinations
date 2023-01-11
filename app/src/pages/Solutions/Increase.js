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
    
    <IntegrateBody/>

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
    min-height: 10vh;
`



function IntegrateBody(props){


    return <IntegrateStyle>
        <Title>
            Increase engagement and build <span><i>a strong hive.</i></span> 
        </Title>
        <TextItem/>
    </IntegrateStyle>
}


const TextItem = () => {


    return <>
        <TextItemTitle>
            NFT Series 
        </TextItemTitle>
        <TextItemBody>
            Creating NFT series was never that easy. Find your astethetic and we deliver a tool to create unlimited, unique, roylities free images matching your vision.
        </TextItemBody>
        <AvatarImgs/>
    </>
}

const BENEFITS = [
    {
        body: 'Royalty-free media to mint and share.'
    },
    {
        body: 'Customized images, video, 3D objects and audio.'
    },
    {
        body: 'Implemented with just a block of code.'
    },
    {
        body: 'Easy, fast and fun!'
    }
]
function AvatarImgs(){
    
    return <IntegrateListStyle>
        {
            Icons.map( (icon, idx) => <IntegrateIcons src={icon}/>
            )
        }
    
    
    
    </IntegrateListStyle>
}
const IntegrateListStyle = styled.div`
float: right;

display: grid;
grid-template-columns: 1fr 1fr 1fr;
gap: 26px;
@media (max-width: ${MOBILE_BREAKPOINT}) {
    gap: 0px;
}
margin-bottom: 5em;

`
const IntegrateIconsContainer = styled.div`
display: flex;
align-items: center;
gap: 26px;
p {
    width: 50%;
    font-family: ${Fonts.body};
    font-style: normal;
    font-weight: 400;
    font-size: 22px;
    line-height: 30px;

    color: ${Colors.offwhite};
}
@media (max-width: ${MOBILE_BREAKPOINT}) {
    margin-top: 4em;
    p {
        width: 90%;
    }
 }
`
const IntegrateIcons = styled.img`
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

