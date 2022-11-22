import styled from '@emotion/styled';
import useAWSNode from '@pollinations/ipfs/reactHooks/useAWSNode';
import React from "react";
import { SEOMetadata } from '../../components/Helmet';
import { GlobalSidePadding } from '../../styles/global';
import Form from './Form';
 
import { Button } from '@material-ui/core';
import { useNavigate, useParams } from 'react-router-dom';
import Previewer from './Previewer';


import { getWebURL } from "@pollinations/ipfs/ipfsWebClient";
import Debug from "debug";
import Banner from '../../components/Banner';
import { FailureViewer } from '../../components/FailureViewer';
import { IpfsLog } from '../../components/Logs';
import { NotebookProgress } from '../../components/NotebookProgress';
import { PollenStatus } from '../../components/PollenStatus';
import useGPUModels from '../../hooks/useGPUModels';
import useLocalStorage from '../../hooks/useLocalStorage';
import { useRandomPollen } from '../../hooks/useRandomPollen';

const debug = Debug("pages/Create");

export default React.memo(function Create() {
    // :id and :model from url
    const params = useParams();
    const { Model } = params;

    // aws stuff
    const { submitToAWS, ipfs, isLoading, setNodeID, updatePollen, queuePosition } = useAWSNode(params);

    const { models } = useGPUModels();

    const modelsIndexedByPath = Object.fromEntries(Object.entries(models).map(([_key, model]) => [model.path, model] ));

    const selectedModel = modelsIndexedByPath[Model] || {url: '', key: ''};

    const [isAdmin, _] = useLocalStorage('isAdmin', false);
    
    const navigateTo = useNavigate();

    useRandomPollen(params.nodeID, selectedModel.key, setNodeID);

    // dispatch to AWS
    const dispatch = async (values) => {
        values = {...values, caching_seed: Math.floor(Math.random() * 1000)};
        debug("submitting to aws", selectedModel.key, values)
        const { nodeID } = await submitToAWS(values, selectedModel.key, false, {priority: isAdmin ? 10 : 0});
        if (!Model) {
            navigateTo(`/create/${nodeID}`);
        } else {
            navigateTo(`/create/${Model}/${nodeID}`);
        }
    }

    debug("selectedModel", selectedModel, Model, Object.keys(models));

    return <PageLayout >
        <SEOMetadata title={selectedModel.name ?? 'Polllinations'} />
        <Banner/>
        <ParametersArea>
            <FlexBetween>
                <h2>
                    {selectedModel.name}
                </h2>
                <p>
                    { isLoading && (queuePosition > 0) && `Queue position: ${queuePosition}` }
                </p>
            </FlexBetween>
            { isLoading && <NotebookProgress output={ipfs?.output} /> }
            <PollenStatus log={ipfs?.output?.log}/> 
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
                    isAdmin && ipfs?.output && <><br />Output [<Button 
                        href={getWebURL(ipfs?.output[".cid"])} 
                        target="_blank"
                    >
                        Open
                        </Button>]</>
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
margin-top: 3em;
`
const ResultsArea = styled.div`
grid-area: results;
`

function parseURL(url){
    const [ , ...parts ] = url.split('/');
    return parts.join('/');
}

const FlexBetween = styled.div`
display: flex;
flex-direction: column;
// justify-content: space-between;
align-items: flex-start;
gap: 0em;
h2,p {
    margin: 0;
}
margin: 1em 0;
`