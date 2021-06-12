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

let FormView = ({ schema, onSubmit }) =>
    <Form
        uiSchema={uiSchema}
        schema={schema}
        onSubmit={onSubmit}>
        <div style={{ display: 'flex', widht: '100%', justifyContent: 'flex-end' }}>
            <Button
                type="submit"
                variant='contained'
                children={IS_SUBMITED ? 'Cancel' : 'Submit'}
                style={{ margin: '0 auto !important' }} />
        </div>
    </Form>

export default FormView
