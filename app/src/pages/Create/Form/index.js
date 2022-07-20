import styled from '@emotion/styled';
import TextField from '@material-ui/core/TextField';
import PrimaryButton from '../../../components/atoms/PrimaryButton';
import { useFormik } from 'formik';
import { zipObj } from 'ramda';
import { useEffect } from 'react';
import CustomizeParameters from './CustomizeParameters';
import SelectModel from './SelectModel';

const PROMPT_KEY = 'Prompt';

const Form = ({ 
    onSubmit, isDisabled, models, 
    selectedModel, onSelectModel }) => {


    const formik = useFormik({
        // Initialize the form only with prompt value
        initialValues: {
            Prompt: 'Bauhaus spaceship',
        },
        onSubmit,
        enableReinitialize: true,
    });
    
    const inputs = models[selectedModel?.key]?.components.schemas.Input.properties;
  
    useEffect(()=>{
      // add other fields to the form when user selects the desired model.
      formik.setValues(state => ({ Prompt: state.Prompt, ...getInitialValues(inputs) }))
    },[selectedModel])
    

  return <StyledForm onSubmit={formik.handleSubmit} >

    <TextField 
      value={formik.values[`${PROMPT_KEY}`]} 
      onChange={formik.handleChange} 
      name={PROMPT_KEY} 
      label="Prompt" 
      disabled={isDisabled}
      fullWidth
    />

    <SelectModel 
      models={models} 
      isDisabled={isDisabled}
      selectedModel={selectedModel} 
      onSelectModel={onSelectModel}
    />

    <CustomizeParameters
      isDisabled={isDisabled}
      inputs={inputs}
      formik={formik}
    />

    <PrimaryButton type='submit' disabled={isDisabled} marginLeft>
      { formik.isSubmitting ? 'Creating...' : 'Create' }
    </PrimaryButton>


  </StyledForm>
};
export default Form;

const StyledForm = styled.form`
display: flex;
flex-direction: column;
align-items: center;
gap: 1em;
width: 100%;

`

function getInitialValues(inputs) {
  if(!inputs) return null
  const keys = Object.keys(inputs).filter(key => key !== PROMPT_KEY);
  return zipObj( keys, keys?.map(key => inputs[key]?.default ));
}