import { Colors, MOBILE_BREAKPOINT } from "../../styles/global"
import styled from "@emotion/styled"
import CTAButton from '../../components/CTA'
import DenseTable from './mock_table_temp'



export default function BillingHistory(){

    return <ContainerStyle>
        <HeadlineStyle>
            Billing history
        </HeadlineStyle>
        <ContentStyle>
            Showing invoices within the past 12 months
        </ContentStyle>
        <DenseTable/>

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
