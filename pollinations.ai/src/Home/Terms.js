    // Start of Selection
    import React from 'react';
    import { usePollinationsText } from "@pollinations/react";
    import useRandomSeed from '../hooks/useRandomSeed';
    import ReactMarkdown from 'react-markdown';
    import { FOOTER_TERMS_CONDITIONS } from '../config/copywrite';
    import styled from '@emotion/styled';
    
    const Terms = () => {
        const seed = useRandomSeed();
        const terms = usePollinationsText(FOOTER_TERMS_CONDITIONS, { seed });
    
        return (
            <TermsBox>
                <MarkDownStyle> 
                    <ReactMarkdown>{terms}</ReactMarkdown>
                </MarkDownStyle>
            </TermsBox>
        );
    }
    
    export default Terms;
    
    
    const TermsBox = styled.div`
        min-width: 20%;
        max-width: 1000px;
        margin: auto;
        margin-bottom: 7em;
        padding: 1em;
    `;
    
    const MarkDownStyle = styled.div`
        h6 {
            font-size: 1.3rem;
            font-weight: 700;
            line-height: 1.6;
            color: #fdfdfd;
        }
        p {
            font-size: 1.1rem;
            line-height: 1.43;
            color: #fdfdfd;
        }
    `;
