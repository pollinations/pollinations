# make an venv folder first and activate it
# example commands:
# python3 -m venv venv
# source venv/bin/activate
# then run this script
#install modal python and huggingface hub
pip install modal huggingface_hub
#auth modal 
modal new token
#download the model locally 
hf download meituan-longcat/LongCat-Image --local-dir models/


# if you have a hugging face hub token, you can also do:
# hf download meituan-longcat/LongCat-Image --local-dir models/ --token=YOUR_HF_TOKEN


# Upload the model to modal dir 
modal volume put <name-of-your-volume> models/ longcat-model/
# Remove the local model
rm -rf models/

# Prepared with <3 by Circuit-Overtime