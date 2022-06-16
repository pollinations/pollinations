import Debug from "debug";
import { mapObjIndexed, zipObj } from "ramda";

const debug = Debug("helpers");

// Get the form inputs from the ipfs object. 
// Use the metadata to find default values
export function getForm(ipfsInput, metadata) {
  
    // Merge Social checkbox with the form inputs
    const propertiesWithSocial = ({...metadata.form.properties, ...SocialField});
  
    // Get the form inputs with defaults
    const inputs = overrideDefaultValues(propertiesWithSocial, ipfsInput);
  
    if (!inputs)
      return null
    
    // Return the form inputs and initial values
    return inputs
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
  