import Form from "@rjsf/material-ui";
import Button from '@material-ui/core/Button'

let IS_SUBMITED = false;

const uiSchema = {
    text_input: {
        "ui:widget": "textarea",
        "ui:disabled": IS_SUBMITED,
    },
    text_not: {
        "ui:widget": "textarea",
        "ui:disabled": IS_SUBMITED
    },
    file: {
        "ui:widget": "file",
        "ui:disabled": IS_SUBMITED
    },
    submit: {
        "ui:disabled": true
    }
};




let FormView = ({ ipfs, metadata, onSubmit, onCancel }) => {

    const filledForm = getFormInputs(ipfs, metadata);

    if (!filledForm)
        return null;

    const schema = { properties: { ...filledForm.properties, file: { type: 'string', title: 'file' } } }

    const showSubmit = ipfs.input && !ipfs.input.cancelled;

    return <Form
        uiSchema={uiSchema}
        schema={schema}
    >
        {
            showSubmit 
            ?   <Button type="button" color="secondary" onClick={onCancel}>
                    Cancel
                </Button>
            :   <Button type="submit" >
                    Submit
                </Button>
        }

    </Form>
}

export default FormView


function getFormInputs(ipfs, metadata) {
    if ((metadata === undefined) || (metadata === null)) return;
    if ((ipfs === undefined) || (ipfs === null)) return metadata;

    return ({
        properties: Object.fromEntries(Object.entries(metadata.form.properties).map(
            ([formKey, prop]) => [formKey, formKey in ipfs ? { ...prop, "default": ipfs[formKey] } : prop]))
    })
}

