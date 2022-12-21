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



export default SelectModel;