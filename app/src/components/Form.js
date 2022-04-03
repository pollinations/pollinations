import { Box, Link } from "@material-ui/core";
import Button from '@material-ui/core/Button';
import Form from "@rjsf/material-ui";
import Debug from "debug";
import { mapObjIndexed, zipObj } from "ramda";
import React, { useEffect, useMemo, useState } from "react";
import FormikForm from "./form/Formik";
import HelpModal from "./HelpModal";
// import { useDropzone } from 'react-dropzone'

const debug = Debug("Form");

const FormView = (props) => {

    // remove this
    let { input:originalInput, connected, metadata, onSubmit, onCancel } = props

    debug("metadata", metadata)

    const colabLink = metadata?.colabLink
    // some variables for conditionally rendering the form parts

    const [inProgress, setInProgress] = useState(false)
    const [input, setInput] = useState(originalInput)
    const formDisabled = !connected || inProgress
    const showSubmit = true

    // don't know why this is necessary, but it is
    useEffect(() => {
        setInput(originalInput)
    }, [originalInput])

    const [properties, uiSchema ] = useMemo(() => {

        // Fill in the form inputs and override default values if they are in the ipfs object
        const filledForm = getFormInputs(input, metadata)
        if (!filledForm)
            return [null,null]

        debug("filledForm", filledForm)

        // the UI schema for the form defines which widgets are used for each input
        const uiSchema = getUISchema(filledForm, showSubmit)

        debug("form uiSchema", uiSchema, filledForm, showSubmit)

        // Hacky way to remove default entries for files
        Object.entries(uiSchema).forEach(([field, prop]) => {
            if (prop["ui:widget"] === "file")
                filledForm[field].default = undefined;
        });
        return [filledForm, uiSchema]
    }, [input, metadata, showSubmit])

    if (!properties)
        return null
        
    return <>
    <FormikForm {...props}/>
    
    <Form
        schema={{ properties }}
        uiSchema={uiSchema}
        onSubmit={({ formData }) => {
            debug("submitted", formData)
            setInput(formData)
            setInProgress(true)
            onSubmit(formData)
        }}
        disabled={formDisabled}
    >
        
        <Box m={1}>
            {showSubmit ? <Button type="submit" disabled={formDisabled} >
                [ {inProgress ? "Submitting..." : "Submit"} ]
            </Button>
                : null
            }

            <HelpModal />

          {colabLink && <Link href={colabLink} target="_blank">[ OPEN IN COLAB ]</Link> }

        </Box>
    </Form>
    </>

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
    debug("getFormInputs", metadata.form.properties, ipfsInput)
    const formInputsWithDefaults = overrideDefaultValues(propertiesWithSocial, ipfsInput)
    debug("formInputsWithDefaults", formInputsWithDefaults)
    return formInputsWithDefaults
}


// Get the ui schema for the form
const getUISchema = (filledForm, enabled) => {
    debug("getUISchema", filledForm, enabled);
    const keys = Object.keys(filledForm)
    return zipObj(keys, keys.map(key => toSchema(key, filledForm[key], enabled)))
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
        "ui:widget": prefixOverride ? prefixOverride[1] : typeMappings[props.type](props),
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
    "video_": "file",
    "image_": "file"
};


const getPrefixOverride = (key) =>
    Object.entries(prefixMappings).find(([prefix]) => key.startsWith(prefix));


const overrideDefaultValues = (propertiesWithSocial, ipfsInput) =>
    mapObjIndexed((prop, formKey) => formKey in ipfsInput ? { ...prop, "default": ipfsInput[formKey] } : prop, propertiesWithSocial)

// If the text has multiple lines return textarea, otherwise text.
function textOrTextarea(defaultVal) {
    return (defaultVal.split("\n").length > 1 ? "textarea" : "text");
}

// // File upload widget using dropzone
// function FileUpload() {
//     const onDrop = useCallback(async acceptedFiles => {
//       // Do something with the files
//       debug("dropped files", acceptedFiles);
//       const file = acceptedFiles[0];
//       const { cid } = await _client.add({content: file.stream(), path: file.path});


//     }, []);

//     const {getRootProps, getInputProps, isDragActive} = useDropzone({onDrop})

//     return (<Paper variant={isDragActive ? "outlined":"elevation"}>
//       <div {...getRootProps()}>
//         <input {...getInputProps()} />
//         {
//           isDragActive ?
//             <p>Drop the files here ...</p> :
//             <p>Drag 'n' drop some files here, or click to select files</p>
//         }
//       </div>
//       </Paper>
//     )
//   }

