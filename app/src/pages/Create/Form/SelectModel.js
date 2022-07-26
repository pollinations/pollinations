import styled from "@emotion/styled";
import { FormControl, InputLabel, MenuItem, Select } from "@material-ui/core";

const SelectModel = ({ models, selectedModel, onSelectModel, isDisabled }) => <>
    <FormControl fullWidth>
        {/* <InputLabel id="model-select-label"> Model </InputLabel> */}
        
        <SelectStyle value={selectedModel.key || ''} onChange={onSelectModel} disabled={isDisabled}>

            {Object.keys(models).map(model => 
                <option key={model} value={model} 
                    //disabled={!models[model].components.schemas.Input.properties.Prompt} 
                >
                    {model.split('/').pop()}
                </option>
            )}

        </SelectStyle>
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