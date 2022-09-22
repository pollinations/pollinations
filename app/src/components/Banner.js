import styled from "@emotion/styled"
import BannerIcon from '../assets/imgs/bannerIcon.svg'
import { MOBILE_BREAKPOINT } from "../styles/global"




export default function Banner(){


    return <Style>
        <img src={BannerIcon} alt="banner icon"/>
        {/* <Grid> */}
            <Item>
                <Headline>
                    Did you know you can integrate AI creation directly within your site or social media?
                </Headline>
                <SubHeadLine>
                    we can make customised AI models with specific aesthetics!
                </SubHeadLine>
            </Item>
            <Item>
                <LabelStyle>
                    Get in touch at:
                </LabelStyle>
                <PillStyle>
                        <span> hello@pollinations.ai </span>
                </PillStyle>
            </Item>
        {/* </Grid> */}
</Style>
};


const Style = styled.div`
margin-top: 1em;
width: 100%;
min-height: 220px;
padding: 1em;
display: flex;
align-items: center;
@media (max-width: ${MOBILE_BREAKPOINT}) {
    flex-wrap: wrap;
    img {
        display: none;
    }
}

background: linear-gradient(90.41deg, rgba(255, 255, 255, 0.17) 1.53%, rgba(255, 255, 255, 0.1) 98.72%);
box-shadow: 0px 4px 24px -1px rgba(0, 0, 0, 0.17);
backdrop-filter: blur(15px);
/* Note: backdrop-filter has minimal browser support */
border-radius: 20px;

h2, h3, p {
    font-family: 'DM Sans';
    font-style: normal;
    font-weight: 400;
}
img {
    height: 156px;
    margin: auto 4em;
    padding-right: 2em;
}
`
const Grid = styled.div`
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
`

const Item = styled.div`
margin-left: 2em;
width: ${props => props.width || '100%'};
`

const Headline = styled.h2`
font-size: 28px;
line-height: 40px;
color: #FFFFFF;
margin-bottom: 0.5em;
`

const SubHeadLine = styled.h2`
font-size: 20px;
line-height: 26px;
/* lime-bright */
color: #E9FA29;
margin-top: 0;
`

const LabelStyle = styled.p`
font-weight: 500;
font-size: 20px;
line-height: 26px;
color: #FFFFFF;
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
`