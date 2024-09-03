import React from 'react';
import usePollinationsImage from '../hooks/usePollinationsImage';

const PollinationsImage = ({ prompt, options, alt, ...props }) => {
    const imageUrl = usePollinationsImage(prompt, options);

    if (!imageUrl) return <p>Loading...</p>;

    return <img src={imageUrl} alt={alt || prompt} {...props} />;
};

export default PollinationsImage;