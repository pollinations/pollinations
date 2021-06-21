import React, { useEffect, useMemo, useState } from "react";
import { Typography, Card, CardContent, GridList, GridListTile } from "@material-ui/core"

import Markdown from 'markdown-to-jsx';

import { any, identity, last } from 'ramda';

import useColab from "../network/useColab"
import readMetadata from "../backend/notebookMetadata";
import { parse } from "json5";
import Debug from "debug";


// Components
import { IpfsLog } from "../components/Logs";
import FormView from '../components/Form'
import ImageViewer from '../components/ImageViewer'
import NodeStatus from "../components/NodeStatus";
import { SEOMetadata } from "../components/Helmet";




const debug = Debug("Model");



const getNotebookMetadata = ipfs => readMetadata(ipfs["notebook.ipynb"]);




export default React.memo(function Model() {

  const { state, dispatch: dispatchInputState } = useColab(); // {state:{ipfs:{},contentID: null, nodeID:null}, dispatch: noop}

  const { ipfs, nodeID } = state;

  const metadata = getNotebookMetadata(ipfs);

  //debug("images", images)
  useEffect(() => {
    debug("First model render. We have a problem if you see this twice.")
  }, []);


  const dispatchForm = async inputs =>  dispatchInputState({ ...state, inputs });

  const cancelForm = () => dispatchInputState({...state, inputs: {...state.inputs, cancelled: true}})

  return <>
    {metadata && <SEOMetadata title={metadata.name} description={metadata.description} /> }
    <div style={{display:'flex', flexWrap: 'wrap'}}>

      {/* control panel */}

        {/* just in case */}
        {metadata && metadata.description ?<div style={{ width: '100%'}}><Markdown>{metadata.description}</Markdown></div> : null}

        {/* status */}
        <div style={{ width: '100%'}}>
          <h3 children='Status' />
          <NodeStatus {...state} />
        </div>
        
        {/* inputs */}
        <div style={{ width: '100%'}}>
          <h3 children='Inputs' />

          <FormView
            input={ipfs.input}
            metadata={metadata}
            nodeID={nodeID}
            onSubmit={dispatchForm} 
            onCancel={cancelForm}
            />
        </div>

      {/* previews */}
      { ipfs.output && <div style={{ width: '100%' }}>
                        <h3 children='Output' />
                        <ImageViewer output={ipfs.output}/>
                      </div>
      }    

      <div style={{ width: '100%'}}>
          <h3 children='Log' />
          <IpfsLog />
      </div>


    </div>


  </>
});
