import { useMemo }  from 'react'
import { mapObjIndexed, zipObj } from 'ramda';
import useModelsMetadata from './useFetchModelsMetadata';
import Debug from "debug";

const debug = Debug("useGPUModels")

function useGPUModels() {
    const modelsMetadata = useModelsMetadata();

    const result = useMemo(() => {

        const models = filterModels(modelsMetadata);

        return {
            models, 
            error: {}, 
            areModelsLoading: modelsMetadata === null, 
        }
    }, [modelsMetadata]);

    return result;
}

const filterModels = modelsMetadata => {
    if (!modelsMetadata)
        return {};

    // transform the new metadata format to the old one (extract each entrie's "openapi" prop)

    const filtered_data = zipObj(
        Object.values(MODELS), 
        Object.values(MODELS)
        // return only the models we want
        .map(model => modelsMetadata[model] )
    );

    console.log("filtered_data" , filtered_data);
    return filtered_data;
}


export default useGPUModels;

const MODELS = {
    "latent-diffusion": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/latent-diffusion-400m",
    "envisioning": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/preset-envisioning",
    // "pollinations/preset-envisioning": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/preset-envisioning",
    // "piano-transcription": "r8.im/bytedance/piano-transcription",
    "voodoohop/dalle-playground": "614871946825.dkr.ecr.us-east-1.amazonaws.com/voodoohop/dalle-playground",
    "pollinations/latent-diffusion-400m": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/latent-diffusion-400m",
    "pollinations/min-dalle": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/min-dalle",
    "pollinations/avatarclip": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/avatarclip",
    "pollinations/preset-frontpage": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/preset-frontpage",
    "pollinations/majesty-diffusion-cog": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/majesty-diffusion-cog",
    "pollinations/swinir": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/swinir",
    "pollinations/disco-diffusion": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/disco-diffusion",
    "pollinations/adampi" : "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/adampi",
    "pollinations/dreamfields-torch": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/dreamfields-torch",
}