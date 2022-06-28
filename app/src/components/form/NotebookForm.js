import Debug from "debug";
import FormikForm from "./Formik";
import { getForm } from './helpers';

const debug = Debug("NotebookForm")

const NotebookForm = ({ input, connected, metadata, onSubmit }) => {
    
  if (!input)
    return null;

  const inputs = getForm(input, metadata);
  const isDisabled = !connected;

  // const hasAdvancedFields = Object.values(inputs).some(({ advanced }) => advanced);
  return <FormikForm inputs={inputs} onSubmit={onSubmit} isDisabled={isDisabled} />
};
export default NotebookForm;