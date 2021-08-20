import Debug from "debug";
import { parse } from "json5";

const debug = Debug("notebookMetadata");

const filterSensitive = line => !line.startsWith("Edit in ");

function readMetadata(notebookJSON) {
  if (!notebookJSON)
    return null;
    
  let {metadata, cells} =  notebookJSON;
  debug("cells",cells,"metadata",metadata);
  const { name } = metadata["colab"];

  const descriptionCell = cells.find(isMarkdownCell);
  const parameterCell = cells.find(isParameterCell);
  
  debug("parameter cell", parameterCell);
  const description = descriptionCell ? descriptionCell["source"]
    .filter(filterSensitive)
    .join("\n") : null;
    
  const parameterTexts = parameterCell ? parameterCell["source"] : null;
  debug("parameter texts", parameterTexts)
  const allParameters = parameterTexts
        .map(extractParameters)
        .filter(param => param)
        .map(mapToJSONFormField);

  const properties = Object.fromEntries(allParameters);
  const primaryInput = allParameters[0][0];
  debug("got parameters", allParameters,"primary input", primaryInput);
  return {
      form: {
        // "title": name,
        // description,
        // type, 
        properties
      },
      name,
      description,
      numCells: cells.length,
      primaryInput
  };

};

const extractParameters = text => text.match(/^([a-zA-Z0-9-_]+)\s=\s(.*)\s+#@param\s*{type:\s*"(.*)"}/);

const parseHandleSpecial = (val, type) => type === "boolean" ? parse(val.toLowerCase()) : parse(val)

const mapToJSONFormField = ([_text, name, defaultVal, type]) => [name, {type, default: parseHandleSpecial(defaultVal, type), title: name}];

const isParameterCell = cell => cell["cell_type"] === "code" && cell["source"].join("\n").includes("#@param");

const isMarkdownCell = cell => cell["cell_type"] === "markdown";


export default readMetadata;