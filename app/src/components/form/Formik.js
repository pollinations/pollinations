import { useFormik } from 'formik';
import { getForm } from './helpers';
import { FormActions, InputField } from './InputsUI';

// TODO render input fields accordingly, clean more
// TODO rename the file to form after its done
const FormikForm = ({ input, connected, metadata, onSubmit }) => {
    
  const { inputs, initialValues } = getForm(input, metadata);
  const colabLink = metadata?.colabLink;
  const isDisabled = !connected;

  if (!inputs)
    return null

  const formik = useFormik({
    initialValues: initialValues,
    // validationSchema: validationSchema,
    onSubmit: (values) => { 
      onSubmit(values); 
      console.log(values);
    }
  });


  return <form onSubmit={formik.handleSubmit}>
    {
      Object.keys(formik.values).map(key => <>
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
    <FormActions 
      isDisabled={isDisabled} 
      formik={formik} 
      colabLink={colabLink} />

  </form>
};
export default FormikForm;