import styled from '@emotion/styled';
import LinearProgress from '@material-ui/core/LinearProgress';
import React from "react";
import Form from './Form/';
import useAWSNode from '@pollinations/ipfs/reactHooks/useAWSNode';
import { GlobalSidePadding } from '../../styles/global';
import { SEOMetadata } from '../../components/Helmet';
 
import useModels from './useModels'
import Previewer from './Previewer';


export default React.memo(function Create() {

    // fetch json list of models from github
    const { models, error, areModelsLoading } = useModels()
    

    // current model, should move to url
    const [ selectedModel, setSelectedModel ] = React.useState({ key: '', url: '' });

    const onSelectModel = e => setSelectedModel({
        url: `${parseURL(e.target.value)}`,
        key: e.target.value
    })


    // aws stuff
    const { submitToAWS, ipfs, isLoading } = useAWSNode('');

    const dispatch = async (values) => {
        console.log(values)
        await submitToAWS(values, selectedModel.url, false);
    }

    
    return <PageLayout >
        <SEOMetadata title={selectedModel.url ?? 'OwnGpuPage'} />
        <ParametersArea>
            
            { isLoading && <LinearProgress style={{margin: '1.5em 0'}} /> }

            <Form 
                models={models}
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