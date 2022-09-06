import styled from '@emotion/styled';
import LinearProgress from '@material-ui/core/LinearProgress';
import React, { useEffect } from "react";
import Form from './Form';
import useAWSNode from '@pollinations/ipfs/reactHooks/useAWSNode';
import { GlobalSidePadding, MOBILE_BREAKPOINT } from '../../styles/global';
import { SEOMetadata } from '../../components/Helmet';
 
import Previewer from './Previewer';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, CircularProgress } from '@material-ui/core';

import Debug from 'debug';

import { IpfsLog } from '../../components/Logs';
import { NotebookProgress } from '../../components/NotebookProgress';
import { FailureViewer } from '../../components/FailureViewer';
import useLocalStorage from '../../hooks/useLocalStorage';
import { getPollens } from '@pollinations/ipfs/awsPollenRunner';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import useGPUModels from '../../hooks/useGPUModels';



const debug = Debug("pages/Create/index");

export default React.memo(function Create() {
    // :id and :model from url
    const params = useParams();
    const { Model } = params;

    // aws stuff
    const { submitToAWS, ipfs, isLoading, setNodeID, updatePollen } = useAWSNode(params);

    const { models } = useGPUModels();

    const modelsIndexedByPath = Object.fromEntries(Object.entries(models).map(([_key, model]) => [model.path, model] ));

    const selectedModel = modelsIndexedByPath[Model] || {url: '', key: ''};

    const [isAdmin, _] = useLocalStorage('isAdmin', false);
    
    const navigateTo = useNavigate();

    useRandomPollen(params.nodeID, selectedModel, setNodeID);

    // dispatch to AWS
    const dispatch = async (values) => {
        values = {...values, caching_seed: Math.floor(Math.random() * 1000)};
        debug("submitting to aws", selectedModel.key, values)
        const { nodeID } = await submitToAWS(values, selectedModel.key, false);
        if (!Model) {
            navigateTo(`/create/${nodeID}`);
        } else {
            navigateTo(`/create/${Model}/${nodeID}`);
        }
    }

    debug("selectedModel", selectedModel, Model, Object.keys(models));

    return <PageLayout >
        <SEOMetadata title={selectedModel.url ?? 'OwnGpuPage'} />
        <ParametersArea>
            <FlexBetween>
                <h2>
                    {selectedModel.name}
                </h2>
                { isLoading && <CircularProgress thickness={2} size={20} /> }
            </FlexBetween>
            { isLoading && <NotebookProgress output={ipfs?.output} /> }
            {/* { isLoading && <LinearProgress style={{margin: '1.5em 0'}} /> } */}
            
            <Form 
                models={models}
                ipfs={ipfs}
                isDisabled={isLoading} 
                selectedModel={selectedModel}
                onSubmit={async (values) => dispatch(values) } 
                Results={
                <ResultsArea>
                    { isAdmin && ipfs?.output?.done === true && <Button variant="contained" color="primary" onClick={() => updatePollen({example: true})}>
                        Add to Examples
                    </Button>
                    }
                    { 
                        ipfs?.output?.success === false ?
                        <FailureViewer ipfs={ipfs} contentID={ipfs[".cid"]}/> 
                        :
                        <Previewer ipfs={ipfs}  /> 
                    }
                </ResultsArea>
                }
            />
            
        </ParametersArea>

        { ipfs && <IpfsLog ipfs={ipfs} contentID={ipfs[".cid"]} /> }
    
    </PageLayout>
});



// STYLES
const PageLayout = styled.div`
padding: ${GlobalSidePadding};
width: 100%;
margin-top: 1em;
min-height: 80vh;

background: radial-gradient(43.05% 43.05% at 50% 56.95%, #2F3039 0%, #000000 100%);
`;

const ParametersArea = styled.div`
width: 100%;

`
const ResultsArea = styled.div`
grid-area: results;
`

function useRandomPollen(nodeID, selectedModel, setNodeID) {
    const [isAdmin,_] = useIsAdmin();
    debug("isAdmin", isAdmin);
    useEffect(() => {
        if (!nodeID && selectedModel.key) {
            (async () => {
                debug("getting pollens for model", selectedModel.key);
                let pollens = await getPollens({ image: selectedModel.key, success: true, example: isAdmin ? false : true});
                
                // if (pollens.length === 0) {
                //     pollens = await getPollens({ image: selectedModel.key, success: true});
                // }

                if (pollens.length > 0) {
                    // select random pollen
                    const { input } = pollens[Math.floor(Math.random() * pollens.length)];
                    setNodeID(input);
                }
            })();
        }
    }, [nodeID, selectedModel]);


}

function parseURL(url){
    const [ , ...parts ] = url.split('/');
    return parts.join('/');
}

const FlexBetween = styled.div`
display: flex;
flex-direction: row;
// justify-content: space-between;
align-items: center;
gap: 1em;
`