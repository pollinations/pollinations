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
  
    useEffect(()=>{
      // add other fields to the form when user selects the desired model.
      formik.setValues(state => ({ 
        // Prompt: state.Prompt, 
        ...getInitialValues(inputs) 
      }))
    },[selectedModel])
    

  return <StyledForm onSubmit={formik.handleSubmit} >

    <PrimaryInput
      isDisabled={isDisabled}
      formik={formik}
      inputs={models[selectedModel?.key]?.components.schemas.Input.properties}
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

  if (!props.inputs) return null;

  const { isDisabled, formik } = props;


  const primary_input =  Object.values(props?.inputs)
    .sort((a,b) => a['x-order'] > b['x-order'])
    .shift();

  return <>
  <String 
      value={formik.values[`${PROMPT_KEY}`]} 
      onChange={formik.handleChange} 
      name={PROMPT_KEY} 
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

function getInitialValues(inputs) {
  if(!inputs) return null
  const keys = Object.keys(inputs).filter(key => key !== PROMPT_KEY);
  return zipObj( keys, keys?.map(key => inputs[key]?.default ));
}