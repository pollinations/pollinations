import { useEffect, useState } from "react";
import Debug from "debug";
import { PLAYGROUND_API_KEY, ENTER_BASE_URL } from "../utils/enterApi";

const debug = Debug("useFetchModels");

/**
 * A hook to fetch available models from the Pollinations API
 * @returns {Object} - Object containing available models and loading state
 */
const useFetchModels = () => {
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setLoading(true);
        fetch(`${ENTER_BASE_URL}/generate/image/models`, {
            headers: {
                "Authorization": `Bearer ${PLAYGROUND_API_KEY}`
            }
        })
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`Failed to fetch models: ${res.status}`);
                }
                return res.json();
            })
            .then((data) => {
                if (Array.isArray(data)) {
                    setModels(data);
                } else {
                    console.error("Unexpected response format:", data);
                    setModels([]);
                }
            })
            .catch((err) => {
                debug("Error fetching models:", err);
                setError(err.message);
                // Fallback to default models if fetch fails
                setModels([
                    "flux",
                    "flux-pro",
                    "flux-realism",
                    "flux-anime",
                    "flux-3d",
                    "flux-cablyai",
                    "turbo",
                ]);
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    return { models, loading, error };
};

export default useFetchModels;
