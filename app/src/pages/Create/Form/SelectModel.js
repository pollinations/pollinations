import { FormControl, InputLabel, MenuItem, Select } from "@material-ui/core";

const SelectModel = ({ models, selectedModel, onSelectModel, isDisabled }) => <>
    <FormControl fullWidth>
        <InputLabel id="model-select-label"> Model </InputLabel>
        
        <Select value={selectedModel.key || ''} onChange={onSelectModel} disabled={isDisabled}>

            {Object.keys(models).map(model => 
                <MenuItem key={model} value={model} 
                    //disabled={!models[model].components.schemas.Input.properties.Prompt} 
                >
                    {model.split('/').pop()}
                </MenuItem>
            )}

        </Select>
    </FormControl>
</>

export default SelectModel;