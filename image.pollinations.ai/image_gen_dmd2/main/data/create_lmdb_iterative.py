from tqdm import tqdm 
import numpy as np
import argparse 
import torch 
import lmdb
import glob 
import os 

def store_arrays_to_lmdb(env, arrays_dict, start_index=0):
    """
    Store rows of multiple numpy arrays in a single LMDB.
    Each row is stored separately with a naming convention.
    """
    with env.begin(write=True) as txn:
        for array_name, array in tqdm(arrays_dict.items()):
            for i, row in enumerate(array):
                # Convert row to bytes
                if isinstance(row, str):
                    row_bytes = row.encode()
                else:
                    row_bytes = row.tobytes()
                data_key = f'{array_name}_{start_index+i}_data'.encode()
                txn.put(data_key, row_bytes)

def get_array_shape_from_lmdb(lmdb_path, array_name):
    with lmdb.open(lmdb_path) as env:
        with env.begin() as txn:
            image_shape = txn.get(f"{array_name}_shape".encode()).decode()
            image_shape = tuple(map(int, image_shape.split()))

    return image_shape 

def load_ode_file(ode_file):
    ode_dict = torch.load(ode_file)

    ode_dict.pop('prompt_list', None)  # Remove 'prompt_list' if exists
    ode_dict.pop('batch_index', None)  # Remove 'batch_index' if exists

    return ode_dict

# Example usage:
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_path", type=str, required=True, help="path to ode pairs")
    parser.add_argument("--lmdb_path", type=str, required=True, help="path to lmdb")

    args = parser.parse_args()

    all_files = sorted(glob.glob(os.path.join(args.data_path, "*.pt")))

    # figure out the maximum map size needed 
    total_array_size = 5000000000000  # adapt to your need, set to 5TB by default 

    env = lmdb.open(args.lmdb_path, map_size=total_array_size * 2) 

    counter = 0

    for index, file in tqdm(enumerate(all_files)):        
        # read from disk 
        data_dict = load_ode_file(file)

        # write to lmdb file 
        store_arrays_to_lmdb(env, data_dict, start_index=counter)
        counter += len(data_dict['latents'])

    # save each entry's shape to lmdb
    with env.begin(write=True) as txn:
        for key, val in data_dict.items():
            print(key, val)
            array_shape = np.array(val.shape)
            array_shape[0] = counter

            shape_key =  f"{key}_shape".encode()
            shape_str = " ".join(map(str, array_shape))
            txn.put(shape_key, shape_str.encode())


if __name__ == "__main__":
    main()
