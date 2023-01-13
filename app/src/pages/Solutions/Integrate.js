import styled from '@emotion/styled'
import { Colors, MOBILE_BREAKPOINT, Fonts } from '../../styles/global'
import { useNavigate } from 'react-router-dom'
import CTA, { EmailCTA } from '../../components/CTA'
import { BackgroundImage, Container as ContainerBase } from './components'
import GradientBG from '../../assets/imgs/integrate-gradient-background.png'
import IntegrateRingsSource from '../../assets/imgs/integrate-rings.png'
import Icons from '../../assets/imgs/integrate-icons/integrate-icons'

const Integrate = props => {

    const navigate = useNavigate()

    return <Style>
    
    <Container>
        
        <Title>
            InTegrATe  <br/>
            <span>
                AI creATion 
            </span> <br/>
            inTo Any plATForM
        </Title>
        <Body>
            
            
        </Body>
    </Container>
    <IntegrateBody/>

    <BackgroundImage 
        src={GradientBG} 
        zIndex='-1' 
        alt="hero_bg" />
    </Style>
  }

  export default Integrate

const Style = styled.div`
    width: 100%;
    height: 100%;
    position: relative;
    
`
  
  
  const Title = styled.p`
  
  font-family: 'SERAFIN';
  font-style: normal;
  font-weight: 400;
  font-size: 160px;
  line-height: 176px;
  
  text-align: left;
    
  color: ${Colors.gray2};

    span {
        float: right !important;
        font-family: 'SERAFIN';
        color: ${Colors.lime};
    }

    @media (max-width: ${MOBILE_BREAKPOINT}) {
        font-size: 80px;
        line-height: 80px;
        padding: 0.3em;
        margin: 0;
    }
  
`
const Body = styled.p`
/* body */
max-width: 520px;
font-family: 'Uncut Sans';
font-style: normal;
font-weight: 400;
font-size: 21px;
line-height: 30px;
text-align: left;
color: ${Colors.gray1};
margin: 0;
margin-top: 44px;
margin-bottom: 50px;
@media (max-width: ${MOBILE_BREAKPOINT}) {
    font-size: 18px;
    line-height: 26px;
    padding: 0 24px;
}
`

const Container = styled(ContainerBase)`
display: flex;
flex-direction: column;
justify-content: center;
align-items: center;

width: 100%;
max-width: 100%;
min-height: 50vh;
@media (max-width: ${MOBILE_BREAKPOINT}) {
padding: 1em;

}
`



function IntegrateBody(props){


    return <IntegrateStyle>
        <IntegrateTitle>
            Increase engagement and build <span><i>a strong hive.</i></span> 
        </IntegrateTitle>
        <IntegrateText>
            Customize AI models to match your vision and get a tailored tool to create unlimited synthetic media.
        </IntegrateText>
        <IntegrateList/>
        <IntegrateRings src={IntegrateRingsSource}/>
    </IntegrateStyle>
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
function IntegrateList(){
    
    return <IntegrateListStyle>
        {
            BENEFITS.map( (item, idx) => <IntegrateIconsContainer>
                <IntegrateIcons src={Icons[idx]}/>
                <p children={item.body}/>
            </IntegrateIconsContainer>)
        }
    
    
    
    </IntegrateListStyle>
}
const IntegrateListStyle = styled.div`
float: right;
display: flex;
flex-direction: column;
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
width: 72px;
height: 72px;
`


const IntegrateRings = styled.img`
position: absolute;
width: 30%;
height: auto;
left: 5.9%;
bottom: 2.3%;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  display: none;
  bottom: 7.3%;
}`;
const IntegrateStyle = styled.div`
padding: 86px;
margin-bottom: 10em;
`
const IntegrateText = styled.p`
width: 30%;
font-family: ${Fonts.body};
font-style: normal;
font-weight: 400;
font-size: 22px;
line-height: 30px;
margin: 0;

color: ${Colors.background_body};
@media (max-width: ${MOBILE_BREAKPOINT}) {
    width: auto;
  }
`

const IntegrateTitle = styled.p`
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

