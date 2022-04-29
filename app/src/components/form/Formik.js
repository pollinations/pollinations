import { Accordion, AccordionSummary } from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import Debug from "debug";
import { useFormik } from 'formik';
import { getForm } from './helpers';
import { FormActions, InputField } from './InputsUI';

const debug = Debug("Formik")

const FormikForm = ({ input, connected, metadata, onSubmit }) => {
    
  if (!input)
    return null;

  const { inputs, initialValues } = getForm(input, metadata);

  const colabLink = metadata?.colabLink;
  const isDisabled = !connected;

  const hasAdvancedFields = Object.values(inputs).some(({ advanced }) => advanced);
  
  if (!inputs || !initialValues)
    return null

  // Formik hook holds the form state and methods 
  const formik = useFormik({
    initialValues: initialValues,
    // validationSchema: validationSchema,
    onSubmit
  });
  debug("formik", formik)

  return <form onSubmit={formik.handleSubmit}>
    { // Basic Inputs
      Object.keys(formik.values).map(key => 
      !inputs[key].advanced &&
      <>
        <InputField
          {...inputs[key]}
          {...formik}
          fullWidth
          disabled={isDisabled}
          id={key}
          label={inputs[key].title}
          type={inputs[key].type}
          helperText={inputs[key].description}
          value={formik.values[key]}
          onChange={formik.handleChange}
          style={{ margin: '1rem 0' }}
        />
      </>
      )
    }   
    { hasAdvancedFields && <Accordion elevation={0}>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls={`advanced_inputs`}
          id={`advanced_inputs`}>
            Advanced Inputs
        </AccordionSummary>
        {
          Object.keys(formik.values).map(key => 
            inputs[key].advanced &&
            <>
              <InputField
                {...inputs[key]}
                {...formik}
                fullWidth
                disabled={isDisabled}
                id={key}
                label={inputs[key].title}
                type={inputs[key].type}
                helperText={inputs[key].description}
                value={formik.values[key]}
                onChange={formik.handleChange}
                style={{ margin: '1.5rem 0' }}
              />
            </>
            )
        }
      </Accordion> }
       
    <FormActions 
      isDisabled={isDisabled} 
      formik={formik} 
      colabLink={colabLink} />

  </form>
};
export default FormikForm;