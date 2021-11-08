import React, { useCallback } from "react";
import Form from "@rjsf/material-ui";
import Button from '@material-ui/core/Button'
import Debug from "debug";
import { Box, Paper, Typography } from "@material-ui/core";
import HelpModal from "./HelpModal";
import { useDropzone } from 'react-dropzone'

const debug = Debug("Form");

const FormView = ({ input, connected, metadata, onSubmit, onCancel }) => {

    debug("metadata", metadata);

    // some variables for conditionally rendering the form parts
    // TODO: has a lot of redundancy. refactor this
    const showSubmit = true; //colabState !== "running";
    const showCancel = false; //!showSubmit && input.formAction !== "cancel";
    const inProgress = false//!!(input && input.formAction);
    const formDisabled = !connected;// || inProgress;


    // Fill in the form inputs and override default values if they are in the ipfs object
    const filledForm = getFormInputs(input, metadata);
    if (!filledForm)
        return null;

    debug("filledForm", filledForm);

    // the UI schema for the form defines which widgets are used for each input
    const uiSchema = getUISchema(filledForm, showSubmit)

    debug("form uiSchema", uiSchema, filledForm, showSubmit)

    // Hacky way to remove default entries for files
    Object.entries(uiSchema).forEach(([field, prop]) => {
        if (prop["ui:widget"] === "file")
          filledForm[field].default = undefined;
    });

    return <Form
        schema={{ properties: filledForm }}
        uiSchema={uiSchema}
        onSubmit={({ formData }) => {
            debug("submitted", formData);
            onSubmit(formData)
        }}
        disabled={formDisabled}
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
    const typeMappings = {
        "boolean": () => "radio",
        "string": mapStringType,
        "number": () => "updown",
        "integer": () => "updown"
    };
    
    // Use custom widgets for certain prefixes such as a
    // file uploader for inputs starting with audio_, file_
    const prefixOverride = getPrefixOverride(key);
    debug("after prefix override", prefixOverride);

    return {
        "ui:widget":  prefixOverride ? prefixOverride[1] : typeMappings[props.type](props),
        "ui_disabled": !enabled
    }

}

// Map the string type to the ui schema type
// - Handles enumerable options differently
// - If the default text has multiple lines it becomes a textarea. Otherwise text.
const mapStringType = ({ default: defaultVal, enum: enumOptions }) => enumOptions ? "select" : textOrTextarea(defaultVal);


const prefixMappings = {
    "file_": "file",
    "num_": "updown",
    "audio_": "file",
    "video_": "file"
};


const getPrefixOverride = (key) =>
    Object.entries(prefixMappings).find(([prefix]) => key.startsWith(prefix));


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

