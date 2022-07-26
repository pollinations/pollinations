import { zipObj } from 'ramda';


export function getInputs(models, selectedModel){
    const inputs = models[selectedModel?.key]?.components.schemas.Input.properties;
    const primary_input =  inputs ? Object.values(inputs)
        .map( (values, idx, array) => 
        ({...values, key: Object.keys(inputs)[idx]})
        )
        .sort((a,b) => a['x-order'] > b['x-order'])
        .shift() : {};


    return { inputs, primary_input };
}
  
export function getInitialValues(inputs) {
    if(!inputs) return null;
    const keys = Object.keys(inputs);
    return zipObj( keys, keys?.sort((a,b)=> inputs[a]['x-order'] > inputs[b]['x-order'])
        .map(key => inputs[key]?.default )
    );
}