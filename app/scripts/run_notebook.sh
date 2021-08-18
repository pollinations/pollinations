#!/bin/bash
IPFS_ROOT=${1:-"/content/ipfs"}

NOTEBOOK_PATH=$IPFS_ROOT/input/notebook.ipynb
NOTEBOOK_OUTPUT_PATH=/content/notebook_out.ipynb

echo "IPFS_ROOT: $IPFS_ROOT"

if [[ $(< "$IPFS_ROOT/input/social") != "false" ]]; then

    echo "🐝: Initializing social media posts to $SOCIAL_PLATFORMS"
    for platform in "twitter" "instagram" "telegram" "facebook" "youtube" "linkedin"; do

        # Get ContentID
        cid=`tail -1 cid`
        
        # Initiate post
        echo "🐝: Posting to $platform with cid: $cid"
        social_post_url="https://pollinations.ai/.netlify/functions/social-post/$platform/$cid"
        echo "🐝: Posting to URL: $social_post_url" 

        mkdir -p $IPFS_ROOT/output/social
        # Do post
        curl $social_post_url > $IPFS_ROOT/output/social/$platform &
    done
    
fi

sleep 10000

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

if test -f ; then
    echo "$FILE exists."
fi

if [[ $(< "$IPFS_ROOT/input/social") != "false" ]]; then

    echo "🐝: Initializing social media posts to $SOCIAL_PLATFORMS"
    for platform in "twitter" "instagram" "telegram" "facebook" "youtube" "linkedin"; do

        # Get ContentID
        cid=`tail -1 cid`
        
        # Initiate post
        echo "🐝: Posting to $platform with cid: $cid"
        social_post_url="https://pollinations.ai/.netlify/functions/social-post/$platform/$cid"
        echo "🐝: Posting to URL: $social_post_url" 

        mkdir -p $IPFS_ROOT/output/social
        # Do post
        curl $social_post_url > $IPFS_ROOT/output/social/$platform &
    done

fi

echo "🐝: Wating for social media posts to finish"
wait
echo "🐝: Done posting to social media"
    
echo -n waiting > $IPFS_ROOT/output/status
