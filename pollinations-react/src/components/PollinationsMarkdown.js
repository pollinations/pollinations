import React from 'react';
import PropTypes from 'prop-types';
import ReactMarkdown from 'react-markdown';
import usePollinationsText from '../hooks/usePollinationsText';

// Constant for the default markdown prompt prefix
const DEFAULT_MARKDOWN_PROMPT_PREFIX = "Return pure markdown.\n\n";

/**
 * PollinationsMarkdown Component
 * 
 * This component generates and displays markdown text using the Pollinations API
 * based on the given prompt.
 *
 * @component
 * 
 * @param {Object} props - The component props
 * @param {React.ReactNode} props.children - The prompt to generate the markdown text.
 *                                          This should be a string for optimal results.
 * @param {number} [props.seed=-1] - The seed for random text generation.
 *                                   Use -1 for a random seed each time.
 * @param {string} [props.promptPrefix=DEFAULT_MARKDOWN_PROMPT_PREFIX] - A prefix to add to the prompt.
 *                                                                      Useful for giving context or instructions.
 * @param {Object} [props...] - Any additional props will be spread onto the ReactMarkdown component.
 * 
 * @returns {JSX.Element} The rendered PollinationsMarkdown component
 * 
 * @example
 * // Basic usage
 * <PollinationsMarkdown>
 *   Create a markdown document about React hooks
 * </PollinationsMarkdown>
 * 
 * @example
 * // Using a specific seed and custom prompt prefix
 * <PollinationsMarkdown seed={42} promptPrefix="Write a technical guide in markdown format:\n\n">
 *   How to implement a linked list in JavaScript
 * </PollinationsMarkdown>
 */
const PollinationsMarkdown = ({
    children,
    seed = -1,
    promptPrefix = DEFAULT_MARKDOWN_PROMPT_PREFIX,
    ...props
}) => {
    // Ensure children is a string
    const promptContent = typeof children === 'string' ? children : '';

    // Combine the prefix and the prompt content
    const fullPrompt = `${promptPrefix}${promptContent}`;

    // Generate the markdown text using the usePollinationsText hook
    const markdown = usePollinationsText(fullPrompt, seed);

    // Render the generated markdown using ReactMarkdown
    return <ReactMarkdown {...props}>{markdown}</ReactMarkdown>;
};

PollinationsMarkdown.propTypes = {
    children: PropTypes.node.isRequired,
    seed: PropTypes.number,
    promptPrefix: PropTypes.string,
};

export default PollinationsMarkdown;