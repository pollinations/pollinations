import { FormControlLabel, Radio, RadioGroup } from "@material-ui/core"


const Boolean = props => <div style={{...props.style, width: '100%'}}>
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

export default Boolean