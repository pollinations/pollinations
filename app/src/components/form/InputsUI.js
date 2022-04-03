import { 
    FormControlLabel, 
    MenuItem, 
    Radio, 
    RadioGroup, 
    TextField,
    Button, Link } from "@material-ui/core"
import HelpModal from "../HelpModal";


export const InputField = (props) => {

    if (!props)
      return null
  
    // Radio buttons Yes/No
    if (props.type === 'boolean') 
      return <>
      <label> {props.title} </label>
      <RadioGroup value={props.value} onChange={e => props.setFieldValue(props.id, e.target.value === 'true' ? true : false)}>
        <FormControlLabel
          label='Yes'
          value={true}
          control={<Radio  />}/>
        <FormControlLabel
          label='No'
          value={false}
          control={<Radio  />}/>      
      </RadioGroup> 
    </>
    
    // Select Component
    if (props.enum?.length > 0) 
    return <TextField select {...props}
    onChange={e => props.setFieldValue(props.id, e.target.value)}>
    {
        props.enum.map(option => <MenuItem key={option} value={option}>
            {option}
        </MenuItem>)
    }
    </TextField>    
  
    // Text/Rest...
    return <TextField fullWidth {...props}/>
  }



  export const FormActions = ({ isDisabled, formik, colabLink }) => {

    return <>
      <Button 
        disabled={isDisabled || formik.isSubmitting} 
        type="submit"
      >
        [ {formik.isSubmitting ? "Submitting" : "Submit"} ]
      </Button>
  
      <HelpModal />
  
      {colabLink && <Link href={colabLink} target="_blank">[ OPEN IN COLAB ]</Link> }
  
    </>
  }