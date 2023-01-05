import { Colors, MOBILE_BREAKPOINT } from "../../styles/global"
import styled from "@emotion/styled"
import CTAButton from '../../components/CTA'



export default function UserToken(){

    return <ContainerStyle>
        <HeadlineStyle>
            API keys
        </HeadlineStyle>
        <ContentStyle>
        Your secret API keys are listed below. <br/> Please note that we do not display your secret API keys again after you generate them.
        <br/> <br/>
        Do not share your API key with others, or expose it in the browser or other client-side code. <br/> In order to protect the security of your account, Pollinations may also automatically rotate any API key that we've found has leaked publicly.
        <br/> <br/>
        You currently do not have any API keys. Please create one below.
        </ContentStyle>
        <div>

        <CTAButton outlined light>
            Create new secret key
        </CTAButton>
        </div>

    </ContainerStyle>
}
const ContainerStyle = styled.div`
display: flex;
flex-direction: column;
gap: 2em;
h1, h2, p {
    font-family: 'Uncut-Sans-Variable';
}
`
const ContentStyle = styled.p`
    max-width: 100%;
    font-style: normal;
    font-weight: 400;
    font-size: 18px;
    line-height: 22px;
    margin: 0;
    /* gray 1 */

    color: ${Colors.offwhite};
}`
const HeadlineStyle = styled.h1`
    font-style: normal;
    font-weight: 700;
    font-size: 32px !important;
    line-height: 42px;
    color: ${Colors.offWhite};
    margin: 0;
`
