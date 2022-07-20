import React from "react";

function useModels(){

    const [ models, setModels ] = React.useState({});
    const [ areModelsLoading, setLoading ] = React.useState(false);
    const [ error, setError ] = React.useState({});

    React.useEffect(()=>{
        
        
        async function fetchInitialModels(){
            
            setLoading(true)
            try {
                const response = await fetch('https://raw.githubusercontent.com/pollinations/model-index/main/images_openapi.json');
                const data = await response.json();
                setModels(data);
                setLoading(false);
            } catch (error) {
                setError(error);
                setLoading(false);
            }
        }

        fetchInitialModels()

    },[])

    return { models, error, areModelsLoading }
}

export default useModels