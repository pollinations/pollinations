import { useState, useEffect } from 'react';
import axios from 'axios';

const usePollinationsImage = (prompt, options = {}) => {
    const [imageUrl, setImageUrl] = useState(null);
    const { width = 1024, height = 1024, model = 'turbo', seed = -1, nologo = true, enhance = false } = options;

    useEffect(() => {
        const fetchImage = async () => {
            try {
                const response = await axios.get(`https://pollinations.ai/p/${encodeURIComponent(prompt)}`, {
                    params: { width, height, model, seed, nologo, enhance }
                });
                setImageUrl(response.config.url);
            } catch (error) {
                console.error('Error fetching image:', error);
            }
        };

        fetchImage();
    }, [prompt, width, height, model, seed, nologo, enhance]);

    return imageUrl;
};

export default usePollinationsImage;