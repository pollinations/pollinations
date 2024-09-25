import React, { useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { usePollinationsText } from '@pollinations/react';

const AsciiContainer = styled.pre`
    font-family: monospace;
    width: 40ch;
    height: 30ch;
    overflow: hidden;
`;

const AsciiArtGenerator = (props) => {

    const [seed, setSeed] = useState(1);

    const prompt = "Unicode/ Ascii Art depicting digital pollination. 30 width x 10 height characters. Use fun unicode stuff but keep a lot of space empty. Return only the characters, no other text or quotes.";

    useEffect(() => {
        const interval = setInterval(() => {
            setSeed(seed => (seed + 1) % 30);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const asciiArt = usePollinationsText(prompt, { seed });

    return <AsciiContainer style={props?.style}>
        {asciiArt}
    </AsciiContainer>;
}

export default AsciiArtGenerator;