
import DropZone from './InputsUI/File';
import String from './InputsUI/String';


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
<String 
    value={formik.values[primary_input?.key]} 
    onChange={formik.handleChange} 
    name={primary_input.key} 
    title={primary_input.title} 
    disabled={isDisabled}
    fullWidth
    />

</>
}

export default PrimaryInput;