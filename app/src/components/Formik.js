import React from 'react';
import { useFormik } from 'formik';
import { mapObjIndexed, zipObj } from "ramda";
import { Button, TextField } from '@material-ui/core';


// TODO render input fields accordingly, clean more

const FormikForm = ({ input, connected, metadata, onSubmit }) => {
    
  const { inputs, initialValues} = getForm(input, metadata);
  const colabLink = metadata?.colabLink;
  const isDisabled = !connected;

  if (!inputs)
    return null

  const formik = useFormik({
    initialValues: initialValues,
    // validationSchema: validationSchema,
    onSubmit: (values) => { onSubmit(values); }
  });

  return <form onSubmit={formik.handleSubmit}>
    {
      Object.keys(formik.values).map(key => <>
        <TextField
          fullWidth
          disabled={isDisabled}
          id={key}
          label={inputs[key].title}
          type={inputs[key].type}
          helperText={inputs[key].description}
          value={formik.values[key]}
          onChange={formik.handleChange}
          style={{ margin: '8px 0' }}
        />
      </>
      )
    }      
    <Button 
      disabled={isDisabled || formik.isSubmitting} 
      type="submit"
    >
      [ {formik.isSubmitting ? "Submitting" : "Submit"} ]
    </Button>
  </form>
};
export default FormikForm;

// Get the form inputs from the ipfs object. 
// Use the metadata to find default values
function getForm(ipfsInput, metadata) {
  if ((metadata === undefined) || (metadata === null)) return;
  ipfsInput = ipfsInput || {};

  // Merge Social checkbox with the form inputs
  const propertiesWithSocial = ({...metadata.form.properties, ...SocialField});

  // Get the form inputs with defaults
  const inputs = overrideDefaultValues(propertiesWithSocial, ipfsInput);

  if (!inputs)
    return null

  // Get the initial values for the form
  const keys = Object.keys(inputs);
  const initialValues = zipObj( keys, keys?.map(key => inputs[key].default) );

  // Return the form inputs and initial values
  return { inputs, initialValues }
}

const overrideDefaultValues = (propertiesWithSocial, ipfsInput) =>
    mapObjIndexed((prop, formKey) => formKey in ipfsInput ? { ...prop, "default": ipfsInput[formKey] } : prop, propertiesWithSocial)

const SocialField = {
  social: {
      type: "boolean",
      title: "Post to Pollinations' social media feeds",
      default: true
  }
}