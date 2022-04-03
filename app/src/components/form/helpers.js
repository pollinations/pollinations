import { mapObjIndexed, zipObj } from "ramda";


// Get the form inputs from the ipfs object. 
// Use the metadata to find default values
export function getForm(ipfsInput, metadata) {
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

  const SocialField = {
    social: {
        type: "boolean",
        title: "Post to Pollinations' social media feeds",
        default: true
    }
  }
  
  const overrideDefaultValues = (propertiesWithSocial, ipfsInput) =>
      mapObjIndexed((prop, formKey) => formKey in ipfsInput ? { ...prop, "default": ipfsInput[formKey] } : prop, propertiesWithSocial)
  