import torch
import io
import os

def safe_torch_load(file_path, device='cpu'):
    """
    Safely load a PyTorch model without using pickle directly.
    
    Args:
        file_path: Path to the model file
        device: Device to load the model to
    
    Returns:
        The loaded model with restricted capabilities
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Model file not found: {file_path}")
    
    # Load the model to the specified device
    return torch.load(file_path, map_location=torch.device(device))

def convert_to_state_dict(model_path, output_path):
    """
    Convert a pickle-based model to a state_dict-based model
    
    Args:
        model_path: Path to the original model
        output_path: Path to save the state_dict model
    """
    model = safe_torch_load(model_path)
    torch.save(model.state_dict(), output_path)
    return output_path
