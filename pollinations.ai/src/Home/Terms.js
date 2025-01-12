import React from 'react';
import { SmallContainer } from "../config/global";
import { usePollinationsText } from "@pollinations/react";
import useRandomSeed from '../hooks/useRandomSeed';
import ReactMarkdown from 'react-markdown';
import { TERMS_CONDITIONS } from '../config/copywrite';

const Terms = () => {
    const seed = useRandomSeed();
    const terms = usePollinationsText(TERMS_CONDITIONS, { seed });

    return (
        <SmallContainer style={{ maxWidth: '1000px' }}>
            <ReactMarkdown>{terms}</ReactMarkdown>
        </SmallContainer>
    );
}

export default Terms;