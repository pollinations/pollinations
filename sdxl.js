import fetch from "node-fetch"
import fs from "fs/promises";

const queuePrompt = async (prompt, width=768, height=768, seed=-1) => {
    seed = seed === -1 ? Math.floor(Math.random() * 1000000) : seed;

    let workflow = {"4": {"inputs": {"ckpt_name": "sd_xl_base_0.9_fp16.safetensors.safetensors"}, "class_type": "CheckpointLoaderSimple"}, "5": {"inputs": {"width": width, "height": height, "batch_size": 1}, "class_type": "EmptyLatentImage"}, "6": {"inputs": {"text": prompt, "clip": ["4", 1]}, "class_type": "CLIPTextEncode"}, "7": {"inputs": {"text": "cgi, doll, lowres, text, error, cropped, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, out of frame, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck, text, watermark, artist name, copyright name, name, necklace", "clip": ["4", 1]}, "class_type": "CLIPTextEncode"}, "8": {"inputs": {"samples": ["17", 0], "vae": ["4", 2]}, "class_type": "VAEDecode"}, "9": {"inputs": {"filename_prefix": "base_output", "images": ["8", 0]}, "class_type": "SaveImage"}, "11": {"inputs": {"ckpt_name": "sd_xl_refiner_0.9_fp16.safetensors.safetensors"}, "class_type": "CheckpointLoaderSimple"}, "12": {"inputs": {"text": "authentic shaman making sushi. award-winning national geographic press photo. bokeh. kodak", "clip": ["11", 1]}, "class_type": "CLIPTextEncode"}, "13": {"inputs": {"text": "cgi, doll, lowres, text, error, cropped, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, out of frame, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck, text, watermark, artist name, copyright name, name, necklace", "clip": ["11", 1]}, "class_type": "CLIPTextEncode"}, "17": {"inputs": {"seed": seed, "steps": 20, "cfg": 6.0, "sampler_name": "dpmpp_2s_ancestral", "scheduler": "normal", "denoise": 1.0, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}, "class_type": "KSampler"}, "18": {"inputs": {"samples": ["20", 0], "vae": ["11", 2]}, "class_type": "VAEDecode"}, "19": {"inputs": {"filename_prefix": "refiner_output", "images": ["18", 0]}, "class_type": "SaveImage"}, "20": {"inputs": {"seed": 366078049798273, "steps": 15, "cfg": 8.0, "sampler_name": "dpmpp_2m", "scheduler": "normal", "denoise": 0.2237890625, "model": ["11", 0], "positive": ["12", 0], "negative": ["13", 0], "latent_image": ["17", 0]}, "class_type": "KSampler"}};


    const data = {
        prompt: workflow
    };

    const response = await fetch('http://127.0.0.1:8188/prompt', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });
    const resObject = await response.json();

    return resObject.prompt_id;
};

const checkPrompt = async (promptId) => {
    let workflowResult = null;

    while (true) {
        const response = await fetch('http://127.0.0.1:8188/history');
        const resObject = await response.json();

        if (resObject.hasOwnProperty(promptId)) {
            workflowResult = resObject[promptId];
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const imageRefined = workflowResult.outputs['19'].images[0].filename;
    const imageUnrefined = workflowResult.outputs['9'].images[0].filename;

    console.log(`image_refined: ${imageRefined}, image_unrefined: ${imageUnrefined}`);

    const path = `/home/ubuntu/generative_image_url/SDXL 0.9/ComfyUI/output/${imageRefined}`;

    // load to buffer

    const buffer = await fs.readFile(path);
    return buffer;
};

export const getXLImage = async (prompt, {width=768, height=768, seed=-1}) => {
    console.log(`Called get_image with prompt: ${prompt}, width: ${width}, height: ${height}, seed: ${seed}`);

    if (width > height && width > 1024) {
        height = Math.floor((1024 / width) * height);
        width = 1024;
    } else if (height > 1024) {
        width = Math.floor((1024 / height) * width);
        height = 1024;
    }

    width = width - (width % 32);
    height = height - (height % 32);

    const promptId = await queuePrompt(prompt, width, height, seed);
    console.log(`prompt_id: ${promptId}`);

    const workflowResult = await checkPrompt(promptId);
    // console.log(`result: ${workflowResult}`);

    return workflowResult;
};

// getImage('your_prompt', 1024, 1024, -1).then(result => console.log(result));


