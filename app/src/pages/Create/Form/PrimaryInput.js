
import DropZone from './InputsUI/File';
import styled from '@emotion/styled'
import { CreateButton, CreateInput } from '../../Home/TryOut';

const PrimaryInput = ({ isDisabled, formik, primary_input, isStable, isFile }) => {


if (isStable) return <>
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
</>;

if (isFile) return <>
    <DropZone 
        value={formik.values[primary_input?.key]} 
        setFieldValue={formik.setFieldValue} 
        id={primary_input.key} 
        title={primary_input.title} 
        disabled={isDisabled}
        fullWidth
    />
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