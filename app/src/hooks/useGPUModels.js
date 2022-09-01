import Debug from "debug";
import {
    zipObj
} from 'ramda';
import {
    useMemo
} from 'react';
import useModelsMetadata from './useFetchModelsMetadata';

const debug = Debug("useGPUModels")

function useGPUModels() {
    const modelsMetadata = useModelsMetadata();

    debug("models loaded models metadata", modelsMetadata);

    const result = useMemo(() => {

        const models = getModelsWithMetadata(modelsMetadata);

        return {
            models,
            error: {},
            areModelsLoading: modelsMetadata === null,
        }
    }, [modelsMetadata]);

    return result;
}

const getModelsWithMetadata = modelsMetadata => {
    if (!modelsMetadata)
        return {};


    const filtered_data = zipObj(
        MODELS.map(({image}) => image),
        MODELS
        .map(({image, listed}) => ({...modelsMetadata[image], listed}))
    );
    
    return filtered_data;
}


export default useGPUModels;

const MODELS = [{
        listed: true,
        image: "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/stable-diffusion-private"
    },
    {
        listed: true,
        image: "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/disco-diffusion"
    },
    {
        listed: true,
        image: "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/latent-diffusion-400m"
    },
    {
        listed: true,
        image: "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/latent-diffusion-400m"
    },
    {
        listed: true,
        image: "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/min-dalle"
    },
    {
        listed: false,
        image: "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/avatarclip"
    },
    {
        listed: true,
        image: "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/preset-frontpage"
    },
    {
        listed: true,
        image: "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/majesty-diffusion-cog"
    },
    {
        listed: true,
        image: "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/swinir"
    },

    {
        listed: true,
        image: "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/adampi"
    },
    {
        listed: true,
        image: "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/dreamfields-torch"
    },
    // "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/preset-envisioning",
    // "614871946825.dkr.ecr.us-east-1.amazonaws.com/voodoohop/dalle-playground",
]