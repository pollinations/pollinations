
import DropZone from './InputsUI/File';
import String from './InputsUI/String';
import styled from '@emotion/styled'
import { CircularProgress, TextField } from '@material-ui/core';
import { getInputs } from './utils';
import { CreateButton, CreateInput } from '../../Home/TryOut';

const PrimaryInputMap = {
    string: props => <String {...props} />,
}
  
  
const PrimaryInput = props => {

const { isDisabled, formik, models, selectedModel } = props;

const { primary_input } = getInputs(models, selectedModel);

const type = primary_input.type;

const isFile = (type === 'string') && (primary_input.format === 'uri');

if (isFile) return <DropZone 
    value={formik.values[primary_input?.key]} 
    setFieldValue={formik.setFieldValue} 
    id={primary_input.key} 
    title={primary_input.title} 
    disabled={isDisabled}
    fullWidth
/>;

return <FlexCenter>

    <CreateInputFullWidth
        variant='filled' 
        value={formik.values[primary_input?.key]}
        onChange={formik.handleChange} 
        name={primary_input.key} 
        title={primary_input.title} 
        disabled={isDisabled}
        placeholder='Type your prompt'
        fullWidth
        />
    <CreateButton type='submit' disabled={isDisabled}>
        { formik.isSubmitting ? 'Creating...' : 'Create' }
    </CreateButton>
</FlexCenter>
}

export default PrimaryInput;

const FlexCenter = styled.div`
width: 100%;
display: flex;
align-items: center;
justify-content: center;
`

const CreateInputFullWidth = styled(CreateInput)`
width: 100%;
`