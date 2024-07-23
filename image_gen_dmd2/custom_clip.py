from transformers import CLIPFeatureExtractor, CLIPModel,CLIPTextModel
clip_model_id = "zer0int/CLIP-GmP-ViT-L-14"

#feature_extractor = CLIPFeatureExtractor.from_pretrained(clip_model_id)
clip_model = CLIPTextModel.from_pretrained("./CLIP-GmP-ViT-L-14/ViT-L-14-GmP-ft-state_dict.pt")

print(clip_model)