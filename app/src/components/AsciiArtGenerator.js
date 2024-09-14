import { usePollinationsText } from '@pollinations/react';
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

    // const [{ seed, lastAsciiArt }, setState] = useState({ seed: 1, lastAsciiArt: null });
    const [seed, setSeed] = useState(1);
    const prompt = "Unicode/ Ascii Art depicting digital pollination. 30 width x 10 height characters. Use fun unicode stuff but keep a lot of space empty. Return only the characters, no other text or quotes.";
    // const promptWithLast = lastAsciiArt ? `${prompt}\n\nModify the previous art like a cellular automata. Use a variety of emojis and unicode characters that fit with the theme.\n\n\`\`\`${lastAsciiArt}\`\`\`` : prompt;
    const asciiArt = usePollinationsText(prompt, seed);
    // useInterval(() => {
    //     setSeed(seed => (seed + 1) % 30);
    // }, 500);


    useEffect(() => {
        setTimeout(() => {
            // if (seed > 30)
            //     setState({ seed: 1, lastAsciiArt: null });
            // else
            //     setState(({ seed: seed + 1, lastAsciiArt: asciiArt }));
            setSeed(seed => (seed + 1) % 30);
        }, 1000);
    }, [asciiArt]);


    return <AsciiContainer style={props?.style}>
        {asciiArt}
    </AsciiContainer>;
}

export default AsciiArtGenerator;