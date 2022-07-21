import styled from '@emotion/styled';
import TextField from '@material-ui/core/TextField';
import PrimaryButton from '../../../components/atoms/PrimaryButton';
import { useFormik } from 'formik';
import { zipObj } from 'ramda';
import { useEffect } from 'react';
import CustomizeParameters from './CustomizeParameters';
import SelectModel from './SelectModel';
import String from './InputsUI/String';

const PROMPT_KEY = 'Prompt';

const Form = ({ 
    onSubmit, isDisabled, models, 
    selectedModel, onSelectModel }) => {


    const formik = useFormik({
        // Initialize the form only with prompt value
        initialValues: {
            // Prompt: 'Bauhaus spaceship',
        },
        onSubmit,
        enableReinitialize: true,
    });
    
    const inputs = models[selectedModel?.key]?.components.schemas.Input.properties;
    const primary_input =  inputs ? Object.values(inputs)
      .map( (values, idx, array) => {
        const keys = Object.keys(inputs);
        return {...values, key: keys[idx]}
      })
      .sort((a,b) => a['x-order'] > b['x-order'])
      .shift() : {};

    useEffect(()=>{
      // add other fields to the form when user selects the desired model.
      formik.setValues(state => ({ 
        // Prompt: state.Prompt, 
        ...getInitialValues(inputs, primary_input) 
      }))
    },[selectedModel])
    

  return <StyledForm onSubmit={formik.handleSubmit} >

    <PrimaryInput
      isDisabled={isDisabled}
      formik={formik}
      primary_input={primary_input}
    />

    <SelectModel 
      models={models} 
      isDisabled={isDisabled}
      selectedModel={selectedModel} 
      onSelectModel={onSelectModel}
    />

    <CustomizeParameters
      isDisabled={isDisabled}
      inputs={models[selectedModel?.key]?.components.schemas.Input.properties}
      formik={formik}
    />

    <PrimaryButton type='submit' disabled={isDisabled} marginLeft>
      { formik.isSubmitting ? 'Creating...' : 'Create' }
    </PrimaryButton>


  </StyledForm>
};
export default Form;

const PrimaryInput = props => {

  const { isDisabled, formik, primary_input } = props;

  return <>
  <String 
      value={formik.values[primary_input?.key]} 
      onChange={formik.handleChange} 
      name={primary_input.key} 
      title={primary_input.title} 
      disabled={isDisabled}
      fullWidth
    />
  
  </>
}

const StyledForm = styled.form`
display: flex;
flex-direction: column;
align-items: center;
gap: 2em;
width: 100%;

`

function getInitialValues(inputs, primary_input) {
  if(!inputs) return null
  const keys = Object.keys(inputs);
  return zipObj( keys, keys?.map(key => inputs[key]?.default ));
}