#!/bin/bash
IPFS_ROOT=${1:-"/content/ipfs"}


CMD=$1

#  parameters["output_path"] = output_path
#   _params = [["-p", quote(key), quote(str(value))] for key, value in parameters.items()]
#   params = [str(val) for sublist in _params for val in sublist]
#   notebook_out_path = f"/content/notebook_output.ipynb"
#   cmd = ["papermill", notebook_path, notebook_out_path] + params + ["--log-output"]
#   cmd = " ".join(cmd)
  
echo 📗: "Removing last run output (if there was any)."
rm -rv $IPFS_ROOT/output/*

echo 📗: "Setting colab status to 'running'"
echo -n running > $IPFS_ROOT/output/status

echo 📗: "Executing $CMD"
bash $CMD

echo 📗: "Setting colab status to waiting"
echo -n waiting > $IPFS_ROOT/output/status
echo 📗: "Setting the state to signify the run has ended"
echo -n true > $IPFS_ROOT/output/done
rm -v $IPFS_ROOT/input/formAction
