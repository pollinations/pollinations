import os
import urllib.request
import requests
import shutil


inception_url = "https://nvlabs-fi-cdn.nvidia.com/stylegan2-ada-pytorch/pretrained/metrics/inception-2015-12-05.pt"


"""
Download the pretrined inception weights if it does not exists
ARGS:
    fpath - output folder path
"""
def check_download_inception(fpath="./"):
    inception_path = os.path.join(fpath, "inception-2015-12-05.pt")
    if not os.path.exists(inception_path):
        # download the file
        with urllib.request.urlopen(inception_url) as response, open(inception_path, 'wb') as f:
            shutil.copyfileobj(response, f)
    return inception_path


"""
Download any url if it does not exist
ARGS:
    local_folder - output folder path
    url - the weburl to download
"""
def check_download_url(local_folder, url):
    name = os.path.basename(url)
    local_path = os.path.join(local_folder, name)
    if not os.path.exists(local_path):
        os.makedirs(local_folder, exist_ok=True)
        print(f"downloading statistics to {local_path}")
        with urllib.request.urlopen(url) as response, open(local_path, 'wb') as f:
            shutil.copyfileobj(response, f)
    return local_path


"""
Download a file from google drive
ARGS:
    file_id - id of the google drive file
    out_path - output folder path
"""
def download_google_drive(file_id, out_path):
    def get_confirm_token(response):
        for key, value in response.cookies.items():
            if key.startswith('download_warning'):
                return value
        return None

    URL = "https://drive.google.com/uc?export=download"
    session = requests.Session()
    response = session.get(URL, params={'id': file_id}, stream=True)
    token = get_confirm_token(response)

    if token:
        params = {'id': file_id, 'confirm': token}
        response = session.get(URL, params=params, stream=True)

    CHUNK_SIZE = 32768
    with open(out_path, "wb") as f:
        for chunk in response.iter_content(CHUNK_SIZE):
            if chunk:
                f.write(chunk)
