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

#create a modal volume to store the model
modal volume create <name-of-your-volume> 
# Upload the model to modal dir 
modal volume put <name-of-your-volume> models/ longcat-model/

# Do it twice for the 2 models and use 2 different volume names
# Link to i2i model:- hf download meituan-longcat/LongCat-Image-Edit --local-dir models/diffusion_models/LongCat-Image-Edit
# Link to t2i model:- hf download meituan-longcat/LongCat-Image --local-dir models/diffusion_models/LongCat-Image
# Remove the local model
rm -rf models/

# Prepared with <3 by Circuit-Overtime