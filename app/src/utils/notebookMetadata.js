import Debug from "debug";
import { parse } from "json5";

const debug = Debug("notebookMetadata");


// extract parameters from the jupyter notebook's parameter cell
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
    .join("\n") : null;
    
  const parameterTexts = parameterCell ? parameterCell["source"] : null;
  debug("parameter texts", parameterTexts)
  const allParameters = parameterTexts
        .map(extractParametersWithComment)
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

// Extract parameter with preceding comment (to override form description with something more meaningful)
const extractParametersWithComment = (text,i,codeRows) => {
  const params = extractParameters(text);
  
  const previousRow = codeRows[i-1];
  if (params && previousRow && previousRow.trim().startsWith("#") && !previousRow.includes("#@param")) {
    const description = previousRow.trim().slice(1).trim();
    return [...params, description]
  }

  return params;
}


// Extracts the parameters from a Colab parameter row
const extractParameters = text => text.match(/^([a-zA-Z0-9-_]+)\s=\s(.*)\s+#@param\s*{type:\s*"(.*)"}/);

const mapToJSONFormField = ([_text, name, defaultVal, type, description]) => {
  
  // If the regex were better we would not need to trim here
  defaultVal = defaultVal.trim();

  if (defaultVal == "True" || defaultVal == "False") 
    defaultVal = defaultVal.toLowerCase();

  debug("Parsing JSON:",{ defaultVal }, defaultVal === "True");
  return [name, {type, default: parse(defaultVal), title: description || name}];
}

// finds the first cell that contains code and the string #@param
const isParameterCell = cell => cell["cell_type"] === "code" && cell["source"].join("\n").includes("#@param");

// finds the first cell of type markdown
const isMarkdownCell = cell => cell["cell_type"] === "markdown";


export default readMetadata;