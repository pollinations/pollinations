import styled from '@emotion/styled';
import LinearProgress from '@material-ui/core/LinearProgress';
import React, { useEffect } from "react";
import Form from './Form';
import useAWSNode from '@pollinations/ipfs/reactHooks/useAWSNode';
import { GlobalSidePadding } from '../../styles/global';
import { SEOMetadata } from '../../components/Helmet';
 
import Previewer from './Previewer';
import { useParams } from 'react-router-dom';
import { MODELS_MAP } from '../../assets/GPUModels';



export default React.memo(function Create() {

    // aws stuff
    const { submitToAWS, ipfs, isLoading } = useAWSNode('');
    // :id from url
    const { Model, MediaId } = useParams();

    // current model, should move to url
    const [ selectedModel, setSelectedModel ] = React.useState({ key: '', url: '' });



    // set selected model with DropDown
    const onSelectModel = e => setSelectedModel({
        url:  e.target.value,
        key: e.target.value
    })

    // set selected model with URL :id
    useEffect(()=>{
        if (!MODELS_MAP[Model]) return;
        setSelectedModel({
            ...MODELS_MAP[Model],
            url: MODELS_MAP[Model]?.key,
        });
    },[Model]);



    // dispatch to AWS
    const dispatch = async (values) => {
        console.log(values, selectedModel.url)
        await submitToAWS(values, selectedModel.url, false);
    }

    
    return <PageLayout >
        <SEOMetadata title={selectedModel.url ?? 'OwnGpuPage'} />
        <ParametersArea>

            <h2>
                {selectedModel.name}
            </h2>
            
            { isLoading && <LinearProgress style={{margin: '1.5em 0'}} /> }
            
            <Form 
                hasSelect={!Model}
                isDisabled={isLoading} 
                selectedModel={selectedModel}
                onSelectModel={onSelectModel}
                onSubmit={async (values) => dispatch(values) } 
            />
            
        </ParametersArea>

        <ResultsArea>
            <Previewer ipfs={ipfs}  /> 
        </ResultsArea>

    </PageLayout>
});


// STYLES
const PageLayout = styled.div`
padding: ${GlobalSidePadding};
width: 100%;
margin-top: 1em;
display: grid;

grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
grid-gap: 0.8em;
min-height: 80vh;

background: radial-gradient(43.05% 43.05% at 50% 56.95%, #2F3039 0%, #000000 100%);
`;

const ParametersArea = styled.div`

`
const ResultsArea = styled.div`
grid-column: 2 / end;
@media (max-width: 640px) {
  grid-column: 1 / 1;
}
`

function parseURL(url){
    const [ , ...parts ] = url.split('/');
    return parts.join('/');
}