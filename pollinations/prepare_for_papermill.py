import papermill as pm
import sys
import json

def notebook_add_metadata(target_notebook):

  with open(target_notebook, "r") as f:
    j = json.load(f)

  param_cell = next(cell for cell in j['cells'] if "#@param" in "\n".join(cell["source"]))
  
  print("Found parameter cell", param_cell)
  param_cell['metadata']['tags'] = ['parameters']
  param_cell['metadata']

  j['metadata']['kernelspec']['language'] = 'python'

  with open(target_notebook, "w") as f:
    #print("Writing modified notebook to", target_notebook)
    json.dump(j, f)

notebook_path = sys.argv[1]


notebook_add_metadata(notebook_path)

parameters = pm.inspect_notebook(notebook_path)
print(json.dumps(parameters,sort_keys=True, indent=4))

# ipfs_root = sys.argv[2]
# for key, value in parameters.items():
#     print(value["default"], file=open(f"{ipfs_root}/input/{key}", 'w'))

