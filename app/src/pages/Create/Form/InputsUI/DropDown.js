import { MenuItem, TextField } from "@material-ui/core";

const DropDown = props => <>
    <TextField 
        select 
        {...props} 
        onChange={e => props.setFieldValue(props.id, e.target.value)}>
        {
            props.enum.map( option => 
                <MenuItem 
                    key={option} 
                    value={option} 
                    children={option}
                />
            )
        }
    </TextField> 
</>

export default DropDown;