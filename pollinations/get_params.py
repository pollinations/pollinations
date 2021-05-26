import papermill as pm
import sys
import json

def notebook_add_metadata(target_notebook):

  with open(target_notebook, "r") as f:
    j = json.load(f)

  param_cell =1
  j['cells'][param_cell]['metadata']['tags'] = ['parameters']
  j['cells'][param_cell]['metadata']
  j['metadata']['kernelspec']['language'] = 'python'

  with open(target_notebook, "w") as f:
    #print("Writing modified notebook to", target_notebook)
    json.dump(j, f)

notebook_path = sys.argv[1]
ipfs_root = sys.argv[2]

notebook_add_metadata(notebook_path)

#print(json.dumps(,sort_keys=True, indent=4))

parameters = pm.inspect_notebook(notebook_path)
for key, default in parameters.items():
    print(default, file=open(f"{ipfs_root}/input/{key}", 'w'))

