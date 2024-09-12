import { PollinationsText } from '@pollinations/react';
import React, { useEffect, useRef, useState } from 'react';
import { useInterval } from 'usehooks-ts';
import styled from '@emotion/styled';

const AsciiContainer = styled.pre`
    font-family: monospace;
    width: 40ch;
    height: 30ch;
    overflow: hidden;
`;

const AsciiArtGenerator = (props) => {
    const [seed, setSeed] = useState(0);

    useInterval(() => {
        setSeed(seed => (seed + 1) % 30);
    }, 500);

    return <AsciiContainer style={props?.style}>
        <PollinationsText seed={seed}>
            Unicode/ Ascii Art depicting digital pollination. 30 width x 10 height characters. Use fun unicode stuff but keep a lot of space empty. Return only the characters, no other text or quotes.
        </PollinationsText>
    </AsciiContainer>;
}

export default AsciiArtGenerator;