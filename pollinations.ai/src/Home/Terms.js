import React from 'react';
import { MarkDownStyle } from "../config/global";
import { usePollinationsText } from "@pollinations/react";
import useRandomSeed from '../hooks/useRandomSeed';
import ReactMarkdown from 'react-markdown';
import { TERMS_CONDITIONS } from '../config/copywrite';
import styled from '@emotion/styled';

const Terms = () => {
    const seed = useRandomSeed();
    const terms = usePollinationsText(TERMS_CONDITIONS, { seed });

    return (
        <TermsBox >
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
`