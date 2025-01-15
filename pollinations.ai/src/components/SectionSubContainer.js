import styled from "@emotion/styled"

export const SectionSubContainer = styled.div`
        display: flex;
        flex-direction: ${props => props.flexDirection || 'column'};
        align-items: ${props => props.alignItems || 'center'};   
        gap: 2em;
        max-width: 1000px;
        margin-left: auto;
        margin-right: auto;
        width: 100%;
        padding-bottom: 4em;
        padding-top: 2em;
`
