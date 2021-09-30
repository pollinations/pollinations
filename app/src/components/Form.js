import React, { useCallback } from "react";
import Form from "@rjsf/material-ui";
import Button from '@material-ui/core/Button'
import Debug from "debug";
import { Box, Paper, Typography } from "@material-ui/core";
import HelpModal from "./HelpModal";
import { useDropzone } from 'react-dropzone'

const debug = Debug("Form");

const FormView = ({ input, status, colabState, metadata, nodeID, onSubmit, onCancel }) => {

    debug("metadata", metadata);

    // some variables for conditionally rendering the form parts
    // TODO: has a lot of redundancy. refactor this
    const showSubmit = status === "disconnected" || status === "ready" && colabState !== "running";
    const showCancel = false; //!showSubmit && input.formAction !== "cancel";
    const inProgress = false//!!(input && input.formAction);
    const formDisabled = status === "disconnected" || inProgress;


    // Fill in the form inputs and override default values if they are in the ipfs object
    const filledForm = getFormInputs(input, metadata);
    if (!filledForm)
        return null;


    debug("colabState", colabState);
    debug("filledForm", filledForm);


    debug("nodeID", nodeID, formDisabled)
    const uiSchema = getUISchema(filledForm, showSubmit)

    debug("form uiSchema", uiSchema, filledForm, showSubmit)

    return <Form
        schema={{ properties: filledForm }}
        uiSchema={uiSchema}
        onSubmit={({ formData }) => onSubmit(formData)}
        disabled={formDisabled || colabState === "running"}
    >
        {/* <FileUpload />  */}
        <Box m={1}>
            {showSubmit ? <Button type="submit" disabled={formDisabled} >
                [ {inProgress ? "Submitting..." : "Submit"} ]
            </Button>
                : null
            }

            {showCancel && <Button type="button" color="secondary" onClick={onCancel} disabled={formDisabled} >
                [ {inProgress ? "Stopping..." : "Stop"} ]
            </Button>
            }
            <HelpModal />

        </Box>
    </Form>

}

export default React.memo(FormView);


// Add a social checkbox to the form
const addSocialCheckbox = (filledFormNoSocial) =>
({
    ...filledFormNoSocial,
    social: {
        type: "boolean",
        title: "Post to Pollinations' social media feeds",
        default: true
    }
});


// Get the form inputs from the ipfs object. Use the metadata to find default values
function getFormInputs(ipfsInput, metadata) {
    if ((metadata === undefined) || (metadata === null)) return;
    ipfsInput = ipfsInput || {};

    const propertiesWithSocial = addSocialCheckbox(metadata.form.properties);
    
    return Object.fromEntries(Object.entries(propertiesWithSocial).map(
        ([formKey, prop]) => [formKey, formKey in ipfsInput ? { ...prop,"enum": prop.enum, "default": ipfsInput[formKey] } : prop]))
}


// Get the ui schema for the form
const getUISchema = (filledForm, enabled) => {
    debug("getUISchema", filledForm, enabled);
    return Object.fromEntries(Object.keys(filledForm).map(key => [key, toSchema(key, filledForm[key], enabled)]))
};


// Convert the form input type to the ui schema type
const toSchema = (key, props, enabled) => {
    // TODO: enable prefixMappings
    const typeMappings = {
        "boolean": () => "radio",
        "string": mapStringType,
        "number": () => "updown",
    };
    
    return {
        "ui:widget":  typeMappings[props.type](props),
        "ui_disabled": !enabled
    }

}

// Map the string type to the ui schema type
// - Handles enumerable options differently
// - If the default text has multiple lines it becomes a textarea. Otherwise text.
const mapStringType = ({ default: defaultVal, enum: enumOptions }) => enumOptions ? "select" : textOrTextarea(defaultVal);


const prefixMappings = {
    "file_": "file",
    "num_": "updown"
};


// If the text has multiple lines return textarea, otherwise text.
function textOrTextarea(defaultVal) {
    return (defaultVal.split("\n").length > 1 ? "textarea" : "text");
}

// File upload widget using dropzone
function FileUpload() {
    const onDrop = useCallback(async acceptedFiles => {
      // Do something with the files
      debug("dropped files", acceptedFiles);
      const file = acceptedFiles[0];
      const { cid } = await _client.add({content: file.stream(), path: file.path});
      
      
    }, []);

    const {getRootProps, getInputProps, isDragActive} = useDropzone({onDrop})
  
    return (<Paper variant={isDragActive ? "outlined":"elevation"}>
      <div {...getRootProps()}>
        <input {...getInputProps()} />
        {
          isDragActive ?
            <p>Drop the files here ...</p> :
            <p>Drag 'n' drop some files here, or click to select files</p>
        }
      </div>
      </Paper>
    )
  }

