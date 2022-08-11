import styled from '@emotion/styled';
import LinearProgress from '@material-ui/core/LinearProgress';
import React, { useEffect } from "react";
import Form from './Form';
import useAWSNode from '@pollinations/ipfs/reactHooks/useAWSNode';
import { GlobalSidePadding, MOBILE_BREAKPOINT } from '../../styles/global';
import { SEOMetadata } from '../../components/Helmet';
 
import Previewer from './Previewer';
import { useNavigate, useParams } from 'react-router-dom';
import { MODELS_MAP } from '../../assets/GPUModels';
import { CircularProgress } from '@material-ui/core';

import Debug from 'debug';
import Examples from '../../components/organisms/Examples';
import { IpfsLog } from '../../components/Logs';
import { NotebookProgress } from '../../components/NotebookProgress';
import { FailureViewer } from '../../components/FailureViewer';

const debug = Debug("pages/Create/index");

const IS_FORM_FULLWIDTH = true;

export default React.memo(function Create() {
    // :id and :model from url
    const params = useParams();
    const { Model } = params;

    // aws stuff
    const { submitToAWS, ipfs, isLoading } = useAWSNode(params);

    // current model, should move to url
    const [ selectedModel, setSelectedModel ] = React.useState({ key: '', url: '' });

    debug("selected model", selectedModel);
    
    const navigateTo = useNavigate();


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
        const { nodeID } = await submitToAWS(values, selectedModel.url, false);
        if (!Model) {
            navigateTo(`/create/${nodeID}`);
        } else {
            navigateTo(`/create/${Model}/${nodeID}`);
        }
    }

    
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
                ipfs={ipfs}
                hasSelect={!Model}
                isDisabled={isLoading} 
                selectedModel={selectedModel}
                onSelectModel={onSelectModel}
                onSubmit={async (values) => dispatch(values) } 
                Results={
                <ResultsArea>
                    { ipfs.success === false && <FailureViewer ipfs={ipfs} contentID={ipfs[".cid"]}/>}
                    <Previewer ipfs={ipfs}  /> 
                </ResultsArea>
                }
            />
            
        </ParametersArea>

        <IpfsLog ipfs={ipfs} contentID={ipfs[".cid"]} />
        
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
width: 70%;
// max-width: 100%;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  width: 100%;
  max-width: 100%;
}
`

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