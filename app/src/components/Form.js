import Form from "@rjsf/material-ui";
import Button from '@material-ui/core/Button'

let FormView = ({ ipfs, metadata, onSubmit, onCancel }) => {

    const filledForm = getFormInputs(ipfs, metadata);

    if (!filledForm)
        return null;

    const showSubmit = ipfs.input && !ipfs.input.cancelled;
    
    const uiSchema = getUISchema(filledForm, showSubmit)
    
    const schema = { properties: { ...filledForm.properties, file: { type: 'string', title: 'file' } } }

    return <Form
        schema={schema}
        uiSchema={uiSchema}
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


const getUISchema = (filledForm, enabled) =>
    Object.fromEntries(Object.keys(filledForm).map(key => toSchema(key, enabled)))


const toSchema = (key, enabled) => {
    const mappings = [
        ["text_","textarea"],
        ["file_", "file"]
    ];

    return { 
        "ui:widget": mappings.find(([keyPrefix, _]) => key.startsWith(keyPrefix)),
        "ui_disabled": !enabled
    }

}
