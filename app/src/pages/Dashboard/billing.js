import { Colors, MOBILE_BREAKPOINT } from "../../styles/global"
import styled from "@emotion/styled"


export default function UserBilling(){

    return <ContainerStyle>
        <HeadlineStyle>
            Billing overview
        </HeadlineStyle>
        <ContentStyle>
            You'll be billed at the end of each calendar month for usage during that month.
        </ContentStyle>


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