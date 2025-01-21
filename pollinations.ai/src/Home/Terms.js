import React from 'react';
import { usePollinationsText } from "@pollinations/react";
import useRandomSeed from '../hooks/useRandomSeed';
import ReactMarkdown from 'react-markdown';
import { FOOTER_TERMS_CONDITIONS } from '../config/copywrite';
import styled from '@emotion/styled';
import { SectionContainer, SectionSubContainer } from '../components/SectionContainer';
import { Colors } from '../config/global';

const Terms = () => {
    const seed = useRandomSeed();
    const terms = usePollinationsText(FOOTER_TERMS_CONDITIONS, { seed });

    return (
        <SectionContainer style={{ backgroundColor: Colors.offblack }}>
            <SectionSubContainer style={{ backgroundColor: Colors.offblack }}>
                <MarkDownStyle>
                    <ReactMarkdown>{terms}</ReactMarkdown>
                </MarkDownStyle>
            </SectionSubContainer>
        </SectionContainer>
    );
}

export default Terms;

const MarkDownStyle = styled.div`
    h1, h2, h3, h4, h5, h6, p, li, blockquote {
        color: ${Colors.offwhite};
    }
    h6 {
        font-size: 1.3rem;
        font-weight: 700;
        line-height: 1.6;
    }
    p {
        font-size: 1.1rem;
        line-height: 1.43;
    }
`;
