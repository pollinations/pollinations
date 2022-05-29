import {
  Button, FormControlLabel, Link, MenuItem,
  Radio,
  RadioGroup,
  TextField
} from "@material-ui/core";
import Debug from "debug";
import HelpModal from "../HelpModal";
import DropZone from "./customInputs/file";

const debug = Debug("InputsUI")

export const InputField = (props) => {

    if (!props)
      return null
    debug("props", props)
    // Dropzone file input
    if (`${props.id}`.includes('file'))
        return <DropZone {...props} />

    // Radio buttons Yes/No
    if (props.type === 'boolean') 
      return <div style={props.style}>
                <label> {props.title} </label>
                <RadioGroup  value={props.value} onChange={e => props.setFieldValue(props.id, e.target.value === 'true' ? true : false)}>
                  <FormControlLabel
                    label='Yes'
                    value={true}
                    control={<Radio  />}
                    disabled={props.disabled}/>
                  <FormControlLabel
                    label='No'
                    value={false}
                    control={<Radio  />}
                    disabled={props.disabled}/>      
                </RadioGroup> 
              </div>
    
    // Select Component
    if (props.enum?.length > 0) 
      return <TextField select {...props}
              onChange={e => props.setFieldValue(props.id, e.target.value)}>
                {
                    props.enum.map(option => (
                      <MenuItem key={option} value={option}>
                        {option}
                      </MenuItem>))
                }
            </TextField>    
  
    // Text/Rest...

    if (props.type === 'integer')
      return <TextField {...props}  type='number'  />
      
    return <TextField fullWidth {...props}/>
  }



  export const FormActions = ({ isDisabled, formik, colabLink }) => {

    return <>
      <Button 
        disabled={isDisabled || formik.isSubmitting} 
        type="submit">
        [ {formik.isSubmitting ? "Submitting" : "Submit"} ]
      </Button>
  
      <HelpModal />
  
      {colabLink && <Link href={colabLink} target="_blank">[ OPEN IN COLAB ]</Link> }
  
    </>
  }