import React, { useState, useEffect } from 'react';
import usePollinationsText from '../hooks/usePollinationsText';

/**
 * Component to display plain text from Pollinations based on the given prompt.
 * 
 * @param {Object} props - The properties object.
 * @param {string} props.children - The prompt to generate the text.
 * @param {number} [props.seed=-1] - The seed for random text generation.
 * @returns {JSX.Element} - The PollinationsText component.
 */
const PollinationsText = ({ children, seed = -1 }) => {
    const textUrl = usePollinationsText(children, seed);
    const [text, setText] = useState('');

    useEffect(() => {
        fetch(textUrl)
            .then(response => response.text())
            .then(data => setText(data))
            .catch(error => console.error('Error fetching text:', error));
    }, [textUrl]);

    return <>{text}</>;
};

export default PollinationsText;