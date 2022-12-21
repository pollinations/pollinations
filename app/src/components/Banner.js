import styled from "@emotion/styled"
import BannerIcon from '../assets/imgs/bannerIcon.svg'
import { MOBILE_BREAKPOINT, Fonts } from "../styles/global"




export default function Banner(){


    return <Style>
        <img src={BannerIcon} alt="banner icon"/>
        <Item area='text'>
            <Headline>
                Integrate AI creation within your site or community.
            </Headline>
            <SubHeadLine>
                We tailor AI models to your needs.
            </SubHeadLine>
        </Item>
        <Item flex area='cta' >
            <div style={{paddingRight: '2em'}}>
            <LabelStyle>
                Get in touch:
            </LabelStyle>
            <PillStyle>
                <span> 
                    hello@pollinations.ai
                </span>
            </PillStyle>
            </div>
        </Item>
</Style>
};


const Style = styled.div`
margin-top: 1em;
width: 100%;

display: grid;
grid-template-columns: 1fr 5fr 2fr;
grid-template-rows: auto;
grid-template-areas: "icon text cta";

padding: 0px 0px;

@media (max-width: ${MOBILE_BREAKPOINT}) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1em;
    img {
        display: none;
    }
}

background: linear-gradient(90.41deg, rgba(255, 255, 255, 0.17) 1.53%, rgba(255, 255, 255, 0.1) 98.72%);
box-shadow: 0px 4px 24px -1px rgba(0, 0, 0, 0.17);
backdrop-filter: blur(15px);
/* Note: backdrop-filter has minimal browser support */
border-radius: 20px;

font-family: ${Fonts.body};
h2, h3, p {
    font-style: normal;
    font-weight: 400;
}
img {
    height: 125px;
    margin: auto 2em;
    padding: 1em 0 1em 2em;
}
`

const Item = styled.div`
grid-area: ${props => props.area || 'item'};
align-self: center;
width: 100%;
padding: 1em;
${props => props.flex ? 'display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center;' : ''}

@media (max-width: ${MOBILE_BREAKPOINT}) {
    width: 100%;
}
`

const Headline = styled.h2`
font-style: normal;
font-weight: 500;
font-size: 24px;
line-height: 40px;
color: #FFFFFF;
margin-bottom: 0.2em;
`

const SubHeadLine = styled.h2`
font-size: 18px;
line-height: 23px;
/* lime-bright */
color: #E9FA29;
margin-top: 0;
`

const LabelStyle = styled.p`
font-weight: 400;
font-size: 18px;
line-height: 23px;
color: #E9FA29;
margin: 0;
`
const PillStyle = styled.p`
font-size: 22px;
line-height: 29px;
color: #FFFFFF;
span {
font-style: italic;
border: 1px solid #E9FA29;
border-radius: 30px;
padding: 0.5em 1em;
}
margin: 1em 0;
`