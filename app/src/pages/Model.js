import React, { useEffect, useMemo, useState } from "react";
import colabLogoImage from "../help/colab_icon.png";
import { Typography, Card, CardContent, GridList, GridListTile } from "@material-ui/core"

import Markdown from 'markdown-to-jsx';

import { any, identity, last } from 'ramda';

import useColab from "../network/useColab"
import readMetadata from "../backend/notebookMetadata";
import { parse } from "json5";
import Debug from "debug";
import { IpfsLog } from "../components/Logs";
import FormView from '../components/Form'
import NodeStatus from "../network/NodeStatus";

const debug = Debug("Model");



const getType = help => help.includes("@param") ? parse(help.replace("@param", "")).type : "string";

const getNotebookMetadata =
  ipfs => readMetadata(ipfs["notebook.ipynb"]);

const fillForm = ({ form }, { input }) => {
  if (!form)
    return null;

  return input ? {
    properties: Object.fromEntries(Object.entries(form.properties).map(
      ([formKey, prop]) => [formKey, formKey in input ? { ...prop, "default": input[formKey] } : prop]
    ))
  }
    :
    form;
};

export default React.memo(function Model() {

  const { state, dispatch: dispatchState } = useColab(); // {state:{ipfs:{},contentID: null, nodeID:null}, dispatch: noop}

  const { ipfs, nodeID } = state;

  const metadata = getNotebookMetadata(ipfs);

  const filledForm = ipfs && metadata ? fillForm(metadata, ipfs) : null;
  console.log(ipfs)
  debug("filled form", filledForm);
  const colabURL = "https://colab.research.google.com/github/voodoohop/pollinations/blob/master/colabs/pollinator.ipynb";

  const extensions = [".jpg", ".png", ".mp4"];

  const filterByExtensions = filename => any(identity, extensions.map(ext => filename.endsWith(ext)));

  const imageFilenames = ipfs.output ? Object.keys(ipfs.output)
    .filter(filterByExtensions) : [];

  const images = imageFilenames.map(filename => [filename, ipfs.output[filename]]);
  console.log(images)
  debug("images", images)
  useEffect(() => {
    debug("First model render. We have a problem if you see this twice.")
  }, []);
  const dispatchForm = async ({ formData }) => {
    dispatchState({ ...state, inputs: formData });
  }




  return <>
    <div style={{display:'flex'}}>

      {/* control panel */}
      <div style={{ width: '30%'}}>

        {/* just in case */}
        {false && metadata && metadata.description ? <CardContent><Markdown>{metadata.description}</Markdown></CardContent> : null}
        {(false && !nodeID) ? <CardContent children={<a href={colabURL} target="_blank"><img src={colabLogoImage} width="70" height="auto" /> </a>} /> : null}

        {/* status */}
        <h3 children='Status' />
        <NodeStatus {...state} />

        {/* inputs */}
        <h3 children='Inputs' style={{ margin: '20px 0' }} />
        {filledForm ?
          <FormView
                                                               //gambiarra pra mostrar o botão de arquivo 
            schema={{ properties: { ...filledForm.properties, file: { type: 'string', title: 'file' } } }}
            onSubmit={dispatchForm} /> : null
        }

      </div>

      {/* previews */}
      <div style={{ width: '70%' }}>
        <CardContent>

          <GridList cellHeight={200} cols={4}>

            {images.slice().reverse().map(([filename, url]) => (
              <GridListTile key={filename} cols={1}>
                <img src={url} alt={filename} style={{ margin: 10 }} />
              </GridListTile>
            ))}

          </GridList>

        </CardContent>
      </div>


    </div>
    <IpfsLog />

  </>
});
