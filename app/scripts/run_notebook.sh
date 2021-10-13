#!/bin/bash
IPFS_ROOT=${1:-"/content/ipfs"}

NOTEBOOK_PATH=$IPFS_ROOT/input/notebook.ipynb
NOTEBOOK_HASH=$(sha1sum $NOTEBOOK_PATH | awk '{print $1}')
NOTEBOOK_OUTPUT_PATH=/content/notebook_out.ipynb

NOTEBOOK_PARAMS_FILE=/content/params.yaml

echo "IPFS_ROOT: $IPFS_ROOT"


# --- Construct Parameters


echo "---" > $NOTEBOOK_PARAMS_FILE
echo "output_path : $IPFS_ROOT/output" >> $NOTEBOOK_PARAMS_FILE
echo "input_path : $IPFS_ROOT/input" >> $NOTEBOOK_PARAMS_FILE


for path in $IPFS_ROOT/input/*; do
    key=$(basename $path)

    # skip if file has extension
    if [[ $key == *.* ]]; then
        continue
    fi

    value=$(<$path)

    echo "${key} : ${value}" >> $NOTEBOOK_PARAMS_FILE
done

echo "🐝 --- PARAMS ---" 
cat $NOTEBOOK_PARAMS_FILE


echo "🐝: Removing last run output if there was any."
rm -rv $IPFS_ROOT/output/*

# --- Log GPU info ---
echo "🐝: Logging GPU info."
nvidia-smi -L > $IPFS_ROOT/output/gpu
nvidia-smi --query-gpu=memory.total --format=noheader,nounits,csv >> $IPFS_ROOT/output/gpu_memory

#NVIDIA_SMI_PID=$!

echo "🐝: Setting colab status to 'running'"
echo -n running > $IPFS_ROOT/output/status
echo "Starting notebook..." > $IPFS_ROOT/output/log


echo "🐝: Preparing notebook for execution with papermill. (Add params tag to paraeter cell)"
python /content/pollinations/pollinations/prepare_for_papermill.py $NOTEBOOK_PATH

# Initialize Run
STATUS=1
RUN_COUNT=0

# --- Run
while [[ "$STATUS" != 0 &&  "$RUN_COUNT" < 3 ]]; do

    # Increment run counter
    RUN_COUNT=$((RUN_COUNT+1))
    echo -n $RUN_COUNT > $IPFS_ROOT/output/run_count

    echo "🐝: Executing papermill" "$NOTEBOOK_PATH" "$NOTEBOOK_OUTPUT_PATH" -f $NOTEBOOK_PARAMS_FILE --log-output

    #echo "🐝: Activate virtual environment"
    #bash /content/pollinations/app/scripts/activate_venv.sh $NOTEBOOK_HASH

    # Install papermill in vitual environment
    pip install --upgrade papermill typing-extensions

    # If papermill fails it needs to pass the exit code along through the pipe.
    set -o pipefail

    # Run notebook
    papermill "$NOTEBOOK_PATH" "$NOTEBOOK_OUTPUT_PATH" -f $NOTEBOOK_PARAMS_FILE --log-output |& tee $IPFS_ROOT/output/log

    # Get exit code
    STATUS=$?
    echo "🐝: Papermill exited with status: $STATUS. Re-running if not 0. Run count: $RUN_COUNT"
 
    #echo "🐝: Deactivating virtual environment"
    #deactivate
    
done



# --- Cleanup

echo "🐝: Setting the state to signify the run has ended"
echo -n true > $IPFS_ROOT/output/done
rm -v $IPFS_ROOT/input/formAction

# -- Done
echo "🐝: Setting colab status to waiting"
rm -v $IPFS_ROOT/output/status
echo -n waiting > $IPFS_ROOT/output/status

# -- Sleep to make sure files are uploaded
echo "🐝: Sleeping 10 seconds"
sleep 10

# --- Post to social media

post_social.sh $IPFS_ROOT


# --- Cleanup
#kill $NVIDIA_SMI_PID

# -- Sleep
echo "🐝: Sleeping to make sure synchronization finished"
sleep 10