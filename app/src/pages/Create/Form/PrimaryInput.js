
import DropZone from './InputsUI/File';
import String from './InputsUI/String';
import styled from '@emotion/styled'
import { TextField } from '@material-ui/core';

const PrimaryInputMap = {
    string: props => <String {...props} />,
}
  
  
const PrimaryInput = props => {

const { isDisabled, formik, primary_input } = props;

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

return <>

    <TextField
        variant='filled' 
        value={formik.values[primary_input?.key]} 
        onChange={formik.handleChange} 
        name={primary_input.key} 
        title={primary_input.title} 
        disabled={isDisabled}
        placeholder='Type your prompt'
        fullWidth
    />
</>
}

export default PrimaryInput;

const CreateInput = styled.input`
width: 53vw;
@media (max-width: 768px) {
    width: 90vw;    
}
height: 65px;
background: linear-gradient(90deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.1) 100%);
border-radius: 60px;
border: none;

font-family: 'DM Sans';
font-style: normal;
font-weight: 400;
font-size: 18px;
line-height: 23px;
display: flex;
align-items: center;

color: #FFFFFF;
padding-left: 1rem;
margin: 1em 0;
`