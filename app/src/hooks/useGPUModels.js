import * as React from 'react'
import { keys, mapObjIndexed, zipObj } from 'ramda';

const GPUModelsContext = React.createContext()

function GPUModelsProvider({ children }) {

    const [ models, setModels ] = React.useState({});
    const [ areModelsLoading, setLoading ] = React.useState(false);
    const [ error, setError ] = React.useState({});

    const wantedModels = MODELS;

    React.useEffect(()=>{
        
        
        async function fetchInitialModels(){
            
            setLoading(true)
            try {
                const response = await fetch('https://raw.githubusercontent.com/pollinations/model-index/main/metadata.json');
                const dataMetadaFormat = await response.json();
                
                // transform the new metadata format to the old one (extract each entrie's "openapi" prop)
                const data = mapObjIndexed(({openapi}) => openapi, dataMetadaFormat);

                const filtered_data = zipObj(
                    Object.values(wantedModels), 
                    Object.values(wantedModels)
                    // return only the models we want
                    .map(model => data[model] )
                    // 
                );

                setModels(filtered_data);
                setLoading(false);
            } catch (error) {
                setError(error);
                setLoading(false);
            }
        }

        fetchInitialModels()

    },[])


    

    return <GPUModelsContext.Provider value={{ 
            models, 
            error, 
            areModelsLoading, 
        }}>
        {children}
    </GPUModelsContext.Provider>
}

function useGPUModels() {
  const context = React.useContext(GPUModelsContext)
  if (context === undefined) {
    throw new Error('useGPUModels must be used within a GPUModelsProvider')
  }
  return context
}

export { GPUModelsProvider, useGPUModels }

const MODELS = {
    "latent-diffusion": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/latent-diffusion-400m",
    "envisioning": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/preset-envisioning",
    // "pollinations/preset-envisioning": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/preset-envisioning",
    // "piano-transcription": "r8.im/bytedance/piano-transcription",
    "voodoohop/dalle-playground": "614871946825.dkr.ecr.us-east-1.amazonaws.com/voodoohop/dalle-playground",
    "pollinations/latent-diffusion-400m": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/latent-diffusion-400m",
    "pollinations/min-dalle": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/min-dalle",
    "kuprel/min-dalle": "r8.im/kuprel/min-dalle",
    "pollinations/avatarclip": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/avatarclip",
    "pollinations/preset-frontpage": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/preset-frontpage",
    "pollinations/majesty-diffusion-cog": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/majesty-diffusion-cog",
    "jingyunliang/swinir": "r8.im/jingyunliang/swinir@sha256:9d91795e944f3a585fa83f749617fc75821bea8b323348f39cf84f8fd0cbc2f7",
    "pollinations/disco-diffusion": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/disco-diffusion",
    "pollinations/adampi" : "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/adampi",
    "pollinations/dreamfields-torch": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/dreamfields-torch",
    "pollinations/stable-diffusion": "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/stable-diffusion-private"
}