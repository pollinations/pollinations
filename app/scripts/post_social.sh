
#!/bin/bash
IPFS_ROOT=${1:-"/content/ipfs"}

CONTENTID_PATH="/content/cid"

# Get ContentID
cid=`tail -1 $CONTENTID_PATH`

echo "🐝: Checking if social media posting is enabled"
if [[ $(< "$IPFS_ROOT/input/social") != "false" ]]; then

    echo "🐝: Initializing social media posts to $SOCIAL_PLATFORMS"
    for platform in "twitter" "instagram" "telegram" "facebook" "youtube" "linkedin" "fbg" "gmb" "pinterest" ; do
        
        # Initiate post
        echo "🐝: Posting to $platform with cid: $cid"
        social_post_url="https://pollinations.ai/.netlify/functions/social-post/$platform/$cid"
        echo "🐝: Posting to URL: $social_post_url" 

        mkdir -p $IPFS_ROOT/output/social
        
        # Do post
        curl $social_post_url > $IPFS_ROOT/output/social/$platform &
        
        # Slap a sleep to avoid timing out  (this was Copilot's idea)
        sleep 5
    done

fi



echo "🐝: Wating for social media posts to finish"
wait
echo "🐝: Done posting to social media"
