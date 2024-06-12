import os
import csv
import shutil
import urllib.request


def get_score(model_name=None, dataset_name=None,
        dataset_res=None, dataset_split=None, task_name=None):
    # download the csv file from server
    url = "https://www.cs.cmu.edu/~clean-fid/files/leaderboard.csv"
    local_path = "/tmp/leaderboard.csv"
    with urllib.request.urlopen(url) as response, open(local_path, 'wb') as f:
        shutil.copyfileobj(response, f)

    d_field2idx = {}
    l_matches = []
    with open(local_path, 'r') as f:
        csvreader = csv.reader(f)
        l_fields = next(csvreader)
        for idx, val in enumerate(l_fields):
            d_field2idx[val.strip()] = idx
        # iterate through all rows
        for row in csvreader:
            # skip empty rows
            if len(row) == 0:
                continue
            # skip if the filter doesn't match
            if model_name is not None and (row[d_field2idx["model_name"]].strip() != model_name):
                continue
            if dataset_name is not None and (row[d_field2idx["dataset_name"]].strip() != dataset_name):
                continue
            if dataset_res is not None and (row[d_field2idx["dataset_res"]].strip() != dataset_res):
                continue
            if dataset_split is not None and (row[d_field2idx["dataset_split"]].strip() != dataset_split):
                continue
            if task_name is not None and (row[d_field2idx["task_name"]].strip() != task_name):
                continue
            curr = {}
            for f in l_fields:
                curr[f.strip()] = row[d_field2idx[f.strip()]].strip()
            l_matches.append(curr)
    os.remove(local_path)
    return l_matches
