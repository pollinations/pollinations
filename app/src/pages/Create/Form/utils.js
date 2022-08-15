import { path, zipObj } from 'ramda';
import Debug from "debug";

const debug = Debug("Form/utils");

export function getInputs(models, selectedModel){
    
    const model =  models[selectedModel?.key];
    
    const inputs = model?.components.schemas.Input.properties;
    
    if (!inputs) return {inputs: {}, primary_input: {}};

    debug("inputs", inputs)
    const primary_input =  inputs ? Object.values(inputs)
        .map( (values, idx, array) => 
        ({...values, key: Object.keys(inputs)[idx]})
        )
        .sort((a,b) => a['x-order'] - b['x-order'])
        .shift() : {};

    const inputsWithEnum = enumResolver(model, inputs);

    debug("inputsWithEnum", inputsWithEnum);
    
    return { inputs: inputsWithEnum, primary_input };
}

export function getInitialValues(inputs) {
    if(!inputs) return null;
    const keys = Object.keys(inputs);

    return zipObj( 
        keys, 
        keys.sort((a,b)=> inputs[a]['x-order'] - inputs[b]['x-order'])
        .map(key => inputs[key].default )
    );
}



// resolve the enum values from the schema. this could use a more general purpose method but it works for now
const enumResolver = (model, inputs) => Object.fromEntries(Object.entries(inputs).map( ([key, value]) =>  [key, value.allOf ? resolveAllOf(model, value) : value]));

const resolveAllOf = (model, value) => {
    const propPath = value.allOf[0]["$ref"].split("/").slice(1);
    return ({...value, ...path(propPath, model)});
}

