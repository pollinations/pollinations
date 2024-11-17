# # bash commands to download the data
# !wget http://images.cocodataset.org/zips/val2014.zip
# !wget http://images.cocodataset.org/annotations/annotations_trainval2014.zip
# !unzip annotations_trainval2014.zip -d coco/
# !unzip val2014.zip -d coco/



# load data
import json
import numpy as np
import pickle 


dir_path = './coco/'
data_file = dir_path + 'annotations/captions_val2014.json'
data = json.load(open(data_file))

np.random.seed(123)

# merge images and annotations
import pandas as pd
images = data['images']
annotations = data['annotations']
df = pd.DataFrame(images)
df_annotations = pd.DataFrame(annotations)
df = df.merge(pd.DataFrame(annotations), how='left', left_on='id', right_on='image_id')


# keep only the relevant columns
df = df[['file_name', 'caption']]
print(df)
print("length:", len(df['file_name']))
# shuffle the dataset
df = df.sample(frac=1)


# remove duplicate images
df = df.drop_duplicates(subset='file_name')

# create a random subset of n_samples
n_samples = 10000
df_sample = df.sample(n_samples)
# print(df_sample)

all_prompts = list(df_sample['caption'])

with open(dir_path + 'all_prompts.pkl', 'wb') as f:
    pickle.dump(all_prompts, f)

# save the sample to a parquet file
df_sample.to_csv(dir_path + 'subset.csv')

# copy the images to reference folder
from pathlib import Path
import shutil
subset_path = Path(dir_path + 'subset')
subset_path.mkdir(exist_ok=True)
counter = 0 

for i, row in df_sample.iterrows():
    path = dir_path + 'val2014/' + row['file_name']
    shutil.copy(path, dir_path + 'subset/')

    counter += 1 
    print(counter, path, dir_path + 'subset/')
