import styled from "@emotion/styled";
import { FormControl, InputLabel, MenuItem } from "@material-ui/core";
import Select from "@material-ui/core/Select";
import TextField from "@material-ui/core/TextField";

const SelectModel = ({ models, selectedModel, onSelectModel, isDisabled }) => <>
    <FormControl style={{width: '100%'}}>
        {/* <InputLabel id="model-select-label"> Model </InputLabel> */}
        
        <Select 
            select 
            variant="filled"
            placeholder="Select a model"
            value={selectedModel.key || null} 
            onChange={onSelectModel} 
            disabled={isDisabled}>

            {Object.keys(models).map(model => 
                <MenuItem key={model} value={model} style={{maxWidth: '100%'}}>
                    {model.split('/').pop()}
                </MenuItem>
            )}

        </Select>
    </FormControl>
</>

const SelectStyle = styled.select`
background: #383838;
border-radius: 4px;
border: none;
height: 37px;

font-family: 'DM Sans';
font-style: normal;
font-weight: 500;
font-size: 16px;
line-height: 21px;


display: flex;
align-items: center;

color: #FFFFFF;
padding-left: 0.5em;

option, option:selected {
// background: #383838;

    font-family: 'DM Sans';
    font-style: normal;
    font-weight: 500;
    font-size: 16px;
    line-height: 21px;
    display: flex;
    align-items: center;

    color: #FFFFFF;
}

`

export default SelectModel;