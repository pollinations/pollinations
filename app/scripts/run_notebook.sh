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


echo "🐝: Removing last run output if there was any."
rm -rv $IPFS_ROOT/output/*

echo -n false > $IPFS_ROOT/output/done

date +%s > $IPFS_ROOT/output/time_start


# Save date for Google Drive folder name
NOW=$( date '+%F_%H:%M:%S' )
GDRIVE_SAVE_PATH=/content/drive/MyDrive/pollinations/$NOW
mkdir -p "$GDRIVE_SAVE_PATH"

# Copy to Google Drive every 60 seconds
watch -n 60 "cp -r $IPFS_ROOT/* $GDRIVE_SAVE_PATH" &> /dev/null &
GDRIVE_COPY_PID=$!


# Transfer inputs from IPFS to the notebook parameters file which is read by papermill

for path in $IPFS_ROOT/input/*; do
    key=$(basename $path)

    # skip if file has extension
    if [[ $key == *.* ]]; then
        continue
    fi
    
    # if it is a directory then save list of absolute file paths to $value in one line
    if [[ -d $path ]]; then
        value=$(ls -1 -d $path/* | sed "s/\(.*\).*/'\1'/" | tr '\n' ' ')
    else
        value=$(<$path)
    fi

    echo "${key} : ${value}" >> $NOTEBOOK_PARAMS_FILE
done

echo "🐝 --- PARAMS ---" 
cat $NOTEBOOK_PARAMS_FILE


# --- Log GPU info ---
echo "🐝: Logging GPU info."
nvidia-smi -L > $IPFS_ROOT/output/gpu
nvidia-smi --query-gpu=memory.total --format=noheader,nounits,csv >> $IPFS_ROOT/output/gpu_memory

echo "Starting notebook..." > $IPFS_ROOT/output/log


echo "🐝: Preparing notebook for execution with papermill. (Add params tag to paraeter cell)"
python /content/pollinations/pollinations/prepare_for_papermill.py $NOTEBOOK_PATH

# Initialize Run
STATUS=1
RUN_COUNT=0

# Save installed python packages before run
pip freeze > $IPFS_ROOT/output/requirements_before_run.pip

# --- Run
while [[ "$STATUS" != 0 &&  "$RUN_COUNT" < 2 ]]; do

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
    papermill "$NOTEBOOK_PATH" "$NOTEBOOK_OUTPUT_PATH" -f $NOTEBOOK_PARAMS_FILE --log-output |& tee -a $IPFS_ROOT/output/log

    # Get exit code
    STATUS=$?
    echo "🐝: Papermill exited with status: $STATUS. Re-running if not 0. Run count: $RUN_COUNT"
 
    #echo "🐝: Deactivating virtual environment"
    #deactivate
    
done

# Save installed python packages after run
pip freeze > $IPFS_ROOT/output/requirements_after_run.pip

FAILED_STATUS=""

# Write if run succeeded to output/success
if [[ "$STATUS" == 0  ]]; then
    echo "🐝: Run succeeded. Writing 'true' to output/success"
    echo -n true > $IPFS_ROOT/output/success
else
    echo "🐝: Run failed. Writing 'false' to output/success"
    echo -n false > $IPFS_ROOT/output/success
    FAILED_STATUS="failed"
fi


# --- Cleanup

echo "🐝: Setting the state to signify the run has ended"
echo -n true > $IPFS_ROOT/output/done
rm -v $IPFS_ROOT/input/formAction

date +%s > $IPFS_ROOT/output/time_end



# -- Sleep to make sure files are uploaded
echo "🐝: Sleeping 10 seconds"
sleep 10

# --- Cleanup
#kill $NVIDIA_SMI_PID

# -- Sleep
echo "🐝: Sleeping to make sure synchronization finished"
sleep 10



# --- Pin
CID=$( tail -n 1 /content/cid )
echo "🐝: Pinning $CID"
node /usr/local/bin/pin.js $CID $FAILED_STATUS


# --- Post if run successfull ---
if [[ "$STATUS" != 1  ]]; then
    echo "🐝: Posting $CID to social media (if posting was enabled by the user)"
    node /usr/local/bin/social_post.js $CID
fi


# Copy last result to Google Drive and kill the copy process
echo "🐝: Copying results to GDRIVE (if not mounted doesn't do anything)"
cp -r $IPFS_ROOT/* $GDRIVE_SAVE_PATH
kill $GDRIVE_COPY_PID