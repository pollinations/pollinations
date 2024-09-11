import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import usePollinationsText from '../hooks/usePollinationsText';

/**
 * Component to display markdown text from Pollinations based on the given prompt.
 * 
 * @param {Object} props - The properties object.
 * @param {string} props.children - The prompt to generate the markdown text.
 * @param {number} [props.seed=-1] - The seed for random text generation.
 * @returns {JSX.Element} - The PollinationsMarkdown component.
 */
const PollinationsMarkdown = ({ children, seed = -1 }) => {
    const textUrl = usePollinationsText(children, seed);
    const [markdown, setMarkdown] = useState('');

    useEffect(() => {
        fetch(textUrl)
            .then(response => response.text())
            .then(data => setMarkdown(data))
            .catch(error => console.error('Error fetching markdown:', error));
    }, [textUrl]);

    const reactMarkdownElement = React.createElement(ReactMarkdown, null, markdown);
    return reactMarkdownElement;
};

export default PollinationsMarkdown;