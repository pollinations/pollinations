#!/bin/bash
IPFS_ROOT=${1:-"/content/ipfs"}

NOTEBOOK_PATH=$IPFS_ROOT/input/notebook.ipynb
NOTEBOOK_OUTPUT_PATH=/content/notebook_out.ipynb

# --- Construct Parameters

PARAMS="-p output_path $IPFS_ROOT/output"

for path in $IPFS_ROOT/input/*; do

    key=$(basename $path)
    if [[ "$key" = "notebook.ipynb" ]]; then
        continue
    fi
    value=$(<$path)
    #value=$(printf '%q' "$value_raw")

    PARAMS+=" -p ${key} ${value}"
done

echo "🐝 PARAMS:" "$PARAMS"


echo "🐝: Removing last run output if there was any."
rm -rv $IPFS_ROOT/output/*


echo "🐝: Setting colab status to 'running'"
echo -n running > $IPFS_ROOT/output/status
echo "Starting notebook..." > $IPFS_ROOT/output/log


echo "🐝: Preparing notebook for execution with papermill. (Add params tag to paraeter cell)"
python /content/pollinations/pollinations/prepare_for_papermill.py $NOTEBOOK_PATH


# --- Run

echo "🐝: Executing papermill" "$NOTEBOOK_PATH" "$NOTEBOOK_OUTPUT_PATH" $PARAMS --log-output 
eval papermill "$NOTEBOOK_PATH" "$NOTEBOOK_OUTPUT_PATH" "$PARAMS" --log-output 


# --- Cleanup

echo "🐝: Setting colab status to waiting"
echo -n waiting > $IPFS_ROOT/output/status
echo "🐝: Setting the state to signify the run has ended"
echo -n true > $IPFS_ROOT/output/done
rm -v $IPFS_ROOT/input/formAction
