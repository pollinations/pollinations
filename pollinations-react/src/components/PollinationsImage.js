import React from 'react';
import usePollinationsImage from '../hooks/usePollinationsImage.js';

/**
 * Component to display a Pollinations image based on the given prompt and options.
 * 
 * @param {Object} props - The properties object.
 * @param {string} [props.prompt] - The prompt to generate the image.
 * @param {Object} [props.options] - Optional parameters for image generation.
 * @param {number} [props.options.width=1024] - The width of the generated image.
 * @param {number} [props.options.height=1024] - The height of the generated image.
 * @param {string} [props.options.model='turbo'] - The model to use for image generation.
 * @param {number} [props.options.seed=-1] - The seed for random image generation.
 * @param {boolean} [props.options.nologo=true] - Whether to generate the image without a logo.
 * @param {boolean} [props.options.enhance=false] - Whether to enhance the generated image.
 * @param {string} [props.alt] - The alt text for the image.
 * @returns {JSX.Element} - The PollinationsImage component.
 */
const PollinationsImage = ({ prompt, width = 768, height = 768, seed = -1, options = {}, alt, children, ...props }) => {
    const finalPrompt = prompt || children;

    const imageUrl = usePollinationsImage(finalPrompt, { ...options, width, height, seed });

    return React.createElement('img', { src: imageUrl, alt: alt || finalPrompt, ...props });
};

export default PollinationsImage;