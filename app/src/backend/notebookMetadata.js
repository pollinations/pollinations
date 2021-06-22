import Debug from "debug";
import { parse } from "json5";

const debug = Debug("notebookMetadata");


function readMetadata(notebookJSON) {
  if (!notebookJSON)
    return null;
    
  let {metadata, cells} =  notebookJSON;
  const { name } = metadata["colab"];
  const descriptionCell = cells[0];
  const parameterCell = cells[1];
  debug("parameter cell", parameterCell);
  const description = descriptionCell["cell_type"] === "markdown" ? descriptionCell["source"].join("\n") : null;
  const parameterTexts = parameterCell["cell_type"] === "code" ? parameterCell["source"] : null;
  debug("parameter texts", parameterTexts)
  const allParameters = parameterTexts
        .map(extractParameters)
        .filter(param => param)
        .map(mapToJSONFormField);
        debug("got parameters", allParameters);
  const properties = Object.fromEntries(allParameters);
  
  return {
      form: {
        // "title": name,
        // description,
        // type, 
        properties
      },
      name,
      description
  };

};

const extractParameters = text => text.match(/^([a-zA-Z0-9-_]+)\s=\s(.*)\s+#@param\s*{type:\s*"(.*)"}/);

const parseHandleSpecial = (val, type) => type === "boolean" ? parse(`"${val}"`) : parse(val)

const mapToJSONFormField = ([_text, name, defaultVal, type]) => [name, {type, default: parseHandleSpecial(defaultVal, type), title: name}];

export default readMetadata;