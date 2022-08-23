
import DropZone from './InputsUI/File';
import String from './InputsUI/String';
import styled from '@emotion/styled'
import { CircularProgress, TextField } from '@material-ui/core';
import { getInputs } from './utils';
import { CreateButton, CreateInput } from '../../Home/TryOut';
import Debug from "debug";

const debug = Debug("Create/Form/PrimaryInput")


const PrimaryInput = ({ isDisabled, formik, primary_input, selectedModel }) => {


const type = primary_input.type;

const isFile = (type === 'string') && (primary_input.format === 'uri');


if (selectedModel.key === '614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/stable-diffusion-private') return <>
<CreateTextArea
    maxlength={10}
    rows={4}
    value={formik.values[primary_input?.key]}
    onChange={formik.handleChange} 
    name={primary_input.key} 
    title={primary_input.title} 
    disabled={isDisabled}
    placeholder='Type your prompt'
/>
<CreateButton type='submit' disabled={isDisabled} marginLeft style={{alignSelf: 'flex-end'}}>
    { formik.isSubmitting ? 'Creating...' : 'Create' }
</CreateButton>
</>

if (isFile) return <>
<DropZone 
    value={formik.values[primary_input?.key]} 
    setFieldValue={formik.setFieldValue} 
    id={primary_input.key} 
    title={primary_input.title} 
    disabled={isDisabled}
    fullWidth
/>
<CreateButton type='submit' disabled={isDisabled} marginLeft style={{alignSelf: 'flex-end'}}>
    { formik.isSubmitting ? 'Creating...' : 'Create' }
</CreateButton>
</>;


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
padding-right: calc(153px - 0.5em);
`

const CreateTextArea = styled.textarea`
resize: none;
width: 100%;
background: linear-gradient(90deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.1) 100%);
// border-radius: 60px;
border: none;

font-family: 'DM Sans';
font-style: normal;
font-weight: 400;
font-size: 18px;
line-height: 23px;
display: flex;
align-items: center;

color: #FFFFFF;
padding: 0.5rem;


`