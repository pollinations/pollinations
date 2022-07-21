
import String from './InputsUI/String';


const PrimaryInputMap = {
    string: props => <String {...props} />,
}
  
  
const PrimaryInput = props => {

const { isDisabled, formik, primary_input } = props;
const Input = PrimaryInputMap[primary_input.type];
if (!Input) return null;

return <>
<Input 
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