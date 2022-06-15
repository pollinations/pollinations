import Debug from "debug";
import CustomFormikForm from './CustomFormik';
import { getForm } from './helpers';

const debug = Debug("Formik")

const FormikForm = ({ input, connected, metadata, onSubmit }) => {
    
  if (!input)
    return null;

  const { inputs, initialValues } = getForm(input, metadata);

  const colabLink = metadata?.colabLink;
  const isDisabled = !connected;

  // const hasAdvancedFields = Object.values(inputs).some(({ advanced }) => advanced);
  return <>
          <CustomFormikForm inputs={inputs} onSubmit={onSubmit} isDisabled={isDisabled} />
        </>
};
export default FormikForm;