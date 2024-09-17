import React from 'react';
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
const PollinationsMarkdown = ({ children, seed = -1, promptPrefix = MARKDOWN_PROMPT_PREFIX, ...props }) => {
    const markdown = usePollinationsText(promptPrefix + children, { seed });

    return React.createElement(ReactMarkdown, props, markdown);
};

const MARKDOWN_PROMPT_PREFIX = "Return pure markdown.\n\n";

export default PollinationsMarkdown;