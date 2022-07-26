import styled from '@emotion/styled';
import PrimaryButton from '../../../components/atoms/PrimaryButton';
import { useFormik } from 'formik';
import { useEffect } from 'react';
import CustomizeParameters from './CustomizeParameters';
import SelectModel from './SelectModel';
import PrimaryInput from './PrimaryInput';
import { getInitialValues, getInputs } from './utils';


const Form = ({ 
    onSubmit, isDisabled, models, 
    selectedModel, onSelectModel }) => {

  const formik = useFormik({
      initialValues: {},
      onSubmit,
      enableReinitialize: true,
  });
    
  const { inputs, primary_input } = getInputs(models, selectedModel);


  useEffect(()=>{
    // add other fields to the form when user selects the desired model.
    formik.setValues(state => ({ 
      // all parameters for the form
      ...getInitialValues(inputs, primary_input),
      
      // override the primary_input value with the old one.
      [primary_input.key]: state[Object.keys(state)[0]]
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


const StyledForm = styled.form`
display: flex;
flex-direction: column;
align-items: center;
gap: 2em;
width: 100%;
`