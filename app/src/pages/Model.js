import React, { useEffect, useMemo, useState } from "react";
import colabLogoImage from "../help/colab_icon.png";
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




const debug = Debug("Model");



const getNotebookMetadata = ipfs => readMetadata(ipfs["notebook.ipynb"]);

function getPreviewImages(ipfs) {
  const extensions = [".jpg", ".png", ".mp4"]

  const filterByExtensions = filename => 
  any(identity, extensions
  .map(ext => filename.endsWith(ext)));

  const imageFilenames = ipfs.output ? Object.keys(ipfs.output)
    .filter(filterByExtensions) : [];

  const images = imageFilenames.map(filename => [filename, ipfs.output[filename]]);

  return images
}


export default React.memo(function Model() {

  const { state, dispatch: dispatchState } = useColab(); // {state:{ipfs:{},contentID: null, nodeID:null}, dispatch: noop}

  const { ipfs, nodeID } = state;

  const metadata = getNotebookMetadata(ipfs);
  const images = getPreviewImages(ipfs)


  //debug("filled form", filledForm);
  const colabURL = "https://colab.research.google.com/github/voodoohop/pollinations/blob/master/colabs/pollinator.ipynb";


  //debug("images", images)
  useEffect(() => {
    debug("First model render. We have a problem if you see this twice.")
  }, []);


  const dispatchForm = async ({ formData }) =>  dispatchState({ ...state, inputs: formData });

  const cancelForm = () => dispatchState({...state, inputs: {...state.inputs, cancelled: true}})

  return <>
    <div style={{display:'flex', flexWrap: 'wrap'}}>

      {/* control panel */}

        {/* just in case */}
        {metadata && metadata.description ? <CardContent><Markdown>{metadata.description}</Markdown></CardContent> : null}
        {(false && !nodeID) ? <CardContent children={<a href={colabURL} target="_blank"><img src={colabLogoImage} width="70" height="auto" /> </a>} /> : null}

        {/* status */}
        <div style={{ width: '100%'}}>
          <h3 children='Status' />
          <NodeStatus {...state} />
        </div>

        {/* inputs */}
        <div style={{ width: '100%'}}>
          <h3 children='Inputs' />

          <FormView
            ipfs={ipfs}
            metadata={metadata}
            onSubmit={dispatchForm} 
            onCancel={cancelForm}
            />
        </div>

      {/* previews */}
      <div style={{ width: '100%' }}>
        <ImageViewer images={images}/>
      </div>

    </div>
    <IpfsLog />

  </>
});
