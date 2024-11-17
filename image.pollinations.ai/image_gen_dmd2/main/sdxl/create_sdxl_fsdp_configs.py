import argparse 
import yaml
import os 

def create_yaml_config(filename, rank, master_ip, args):
    # Define the configuration data
    config_data = {
        "compute_environment": "LOCAL_MACHINE",
        "debug": False,
        "distributed_type": "FSDP",
        "downcast_bf16": "no",
        "fsdp_config": {
            "fsdp_auto_wrap_policy": "SIZE_BASED_WRAP",
            "fsdp_backward_prefetch_policy": "BACKWARD_PRE",
            "fsdp_forward_prefetch": False,
            "fsdp_min_num_params": 3000,
            "fsdp_offload_params": False,
            "fsdp_sharding_strategy": args.sharding_strategy,
            "fsdp_state_dict_type": "SHARDED_STATE_DICT",
            "fsdp_sync_module_states": True,
            "fsdp_use_orig_params": False
        },
        "machine_rank": rank,
        "main_process_ip": master_ip,
        "main_process_port": 2345,
        "main_training_function": "main",
        "mixed_precision": "no",
        "num_machines": args.num_machines,
        "num_processes": 8*args.num_machines,
        "rdzv_backend": "static",
        "same_network": True,
        "tpu_env": [],
        "tpu_use_cluster": False,
        "tpu_use_sudo": False,
        "use_cpu": False
    }

    # Write the configuration data to a YAML file
    with open(filename, 'w') as file:
        yaml.dump(config_data, file, default_flow_style=False)

def main():
    parser = argparse.ArgumentParser(description="Create a YAML configuration file")
    parser.add_argument("--folder", type=str, help="The name of the YAML configuration file to create")
    parser.add_argument("--master_ip", type=str)
    parser.add_argument("--num_machines", type=int, default=8)
    parser.add_argument("--sharding_strategy", type=str, help="sharding strategy. 1-5 FULL_SHARD / SHARD_GRAD_OP / NO_SHARD / HYBRID_SHARD / HYBRID_SHARD_ZERO2")
    args = parser.parse_args()

    os.makedirs(args.folder, exist_ok=True)

    for i in range(args.num_machines):
        filename = os.path.join(args.folder, f"config_rank{i}.yaml")
        create_yaml_config(filename, i, args.master_ip, args) 

if __name__ == "__main__":
    main()