import Form from "@rjsf/material-ui";
import Button from '@material-ui/core/Button'
import Debug from "debug";

const debug = Debug("Form");

let FormView = ({ ipfs, metadata, onSubmit, onCancel }) => {

    const filledForm = getFormInputs(ipfs.input, metadata);

    if (!filledForm)
        return null;

    const showSubmit = ipfs.input && !ipfs.input.cancelled;
    
    const uiSchema = getUISchema(filledForm, showSubmit)
    
    debug("form uiSchema", uiSchema, filledForm, showSubmit)


    return <Form
        schema={{properties: filledForm}}
        uiSchema={uiSchema}
        onSubmit={onSubmit}
    >
        {
            showSubmit 
            ?   <Button type="button" color="secondary" onClick={onCancel}>
                    Cancel
                </Button>
            :   <Button type="submit">
                    Submit
                </Button>
        }
    </Form>
}

export default FormView


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
