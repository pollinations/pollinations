const fs = require('fs');

function readJSONS(path="../colabs") {

  return fs.readdirSync(path).filter(file => file.endsWith(".ipynb")).map(file => {

    let {metadata, cells} =  JSON.parse(fs.readFileSync("../colabs/"+file,"utf8"));
    const {name} = metadata["colab"];
    const descriptionCell = cells[1];
    const parameterCell = cells[3];
    const description = descriptionCell["cell_type"] === "markdown" ? descriptionCell["source"].join("\n") : null;
    const parameterTexts = parameterCell["cell_type"] === "code" ? parameterCell["source"] : null;
    const allParameters = parameterTexts
          .map(extractParameters)
          .filter(param => param)
          .map(mapToJSONFormField);
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
    })
};

const extractParameters = text => text.match(/^([a-zA-Z0-9-_]+)\s=\s'(.*)'\s\s#@param\s{type:\s"(.*)"}/);

const mapToJSONFormField = ([_text, name, defaultVal, type]) => [name, {type, default:defaultVal, title: name}];

fs.writeFileSync("./src/data/notebooks.json",JSON.stringify(readJSONS(), null, 2));