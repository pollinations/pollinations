import { Accordion, AccordionSummary } from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import Debug from "debug";
import { useFormik } from 'formik';
import { zipObj } from 'ramda';
import { FormActions, InputField } from './InputsUI';

const debug = Debug("Formik")

const FormikForm = ({ inputs, onSubmit, isDisabled, extraAction }) => {

    if (!inputs)
    return null;


  const keys = Object.keys(inputs);
  const initialValues = zipObj( keys, keys?.map(key => inputs[key].default) );

  const hasAdvancedFields = Object.values(inputs).some(({ advanced }) => advanced);

  // Formik hook holds the form state and methods 
  const formik = useFormik({
    initialValues: initialValues,
    // validationSchema: validationSchema,
    onSubmit,
    enableReinitialize: true,
  });

  debug("formik",initialValues, formik)

  return <form onSubmit={formik.handleSubmit}>
    { // Basic Inputs
      Object.keys(formik.values).map(key => 
      !inputs[key].advanced &&
      <>
        <InputField
          key={key}
          {...inputs[key]}
          enum={inputs[key].enum}
          setFieldValue={formik.setFieldValue}
          fullWidth
          disabled={isDisabled}
          id={key}
          label={inputs[key].title}
          type={inputs[key].type}
          helperText={inputs[key].description}
          value={formik.values[key]}
          // inputCID={input[".cid"]}
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
                setFieldValue={formik.setFieldValue}
                enum={formik.enum}
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
      extraAction={extraAction}
      isDisabled={isDisabled} 
      formik={formik}  />

  </form>
};
export default FormikForm;