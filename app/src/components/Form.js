import React from "react";
import Form from "@rjsf/material-ui";
import Button from '@material-ui/core/Button'
import Debug from "debug";

const debug = Debug("Form");

const FormView = ({ input, metadata, nodeID, onSubmit, onCancel}) => {

    const filledForm = getFormInputs(input, metadata);

    if (!filledForm)
        return null;


    const showSubmit = !input || !input.submitted;
    const formDisabled = !nodeID;
    const cancelling = input && input.cancelled;

    debug("nodeID",nodeID, formDisabled)
    const uiSchema = getUISchema(filledForm, showSubmit)
    
    debug("form uiSchema", uiSchema, filledForm, showSubmit)


    return <Form
        schema={{properties: filledForm}}
        uiSchema={uiSchema}
        onSubmit={({formData}) => onSubmit({...formData, submitted: true})}
        disabled={formDisabled}
    >
        {
            showSubmit 
            ?  <Button type="submit" disabled={formDisabled}>
                    Submit
                </Button>
            :    <Button type="button" color="secondary" onClick={onCancel} disabled={formDisabled || cancelling}>
                    {cancelling ? "Cancelling...": "Cancel"}
                </Button>
        }
    </Form>
}

export default React.memo(FormView)


function getFormInputs(ipfs, metadata) {
    if ((metadata === undefined) || (metadata === null)) return;
    ipfs = ipfs || {};

    return Object.fromEntries(Object.entries(metadata.form.properties).map(
            ([formKey, prop]) => [formKey, formKey in ipfs ? { ...prop, "default": ipfs[formKey] } : prop]))
}


const getUISchema = (filledForm, enabled) =>
    Object.fromEntries(Object.keys(filledForm).map(key => [key, toSchema(key, enabled)]))


const toSchema = (key, enabled) => {
    const mappings = [
        ["text_","text"],
        ["file_","file"],
        ["num_","updown"],
        ["","text"]
    ];

    return { 
        "ui:widget": mappings.find(([keyPrefix, _]) => key.startsWith(keyPrefix))[1],
        "ui_disabled": !enabled
    }

}
