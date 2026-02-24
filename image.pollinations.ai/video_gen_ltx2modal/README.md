# LTX2 ComfyUI on Modal (Async API)

Deploys ComfyUI as an async, cost-efficient API for video generation on Modal. Jobs are queued in ComfyUI, GPUs scale to zero when idle, and clients poll for status/result instead of holding long HTTP connections.

## Project layout
- `ltx2-t2v-distilled/comfyapp_ltx_distilled.py` — Modal app (enqueue/status/result endpoints, ComfyUI runner, model cache mounting).
- `video_ltx2_t2v_distilled.json` — workflow exported from ComfyUI (API export). Nodes must match the ID constants in the app.
- `frontend/index.html` — optional static UI (polls every 3s; supports prompt, width, height, frame_count).

## API

### Enqueue  
`POST https://<app>-enqueue.modal.run/`

Body:
```json
{ "prompt": "test", "width": 720, "height": 720, "frame_count": 121 }
```
Response:
```json
{ "prompt_id": "..." }
```

### Status  
`GET https://<app>-status.modal.run/?prompt_id=...`

Responses:
- `{"status":"running"}`
- `{"status":"done","content_type":"video/mp4","output":{...}}`

### Result  
`GET https://<app>-result.modal.run/?prompt_id=...`
- `202 Not ready` while generating
- Binary video (`video/mp4` or `video/webm`) when ready

> Example (your deployment may include a prefix such as `pollinations--`):  
> `https://pollinations--ltx2-comfyui-api-distilled-enqueue.modal.run/`

## Deployment

1) **Workflow**  
Export your ComfyUI workflow via *Menu → Save → Export (API)* and place it at `video_ltx2_t2v_distilled.json`. Update these IDs if they differ:  
`PROMPT_NODE_ID`, `WIDTH_NODE_ID`, `HEIGHT_NODE_ID`, `FRAME_COUNT_NODE_ID` in `comfyapp_ltx_distilled.py`.

2) **Model cache (required)**  
The app mounts a volume `hf-hub-cache-distilled` at `/cache` and loads models with `local_files_only=True`. Before first run, populate that volume with the files listed in `MODEL_MAP` (HF repos `Lightricks/LTX-2`, `Comfy-Org/ltx-2`, etc.). If you prefer online fetches, flip `local_files_only=False` in `_setup_models_from_cache`.

3) **Deploy**  
```bash
modal deploy ltx2-t2v-distilled/comfyapp_ltx_distilled.py
```
Modal will print the three endpoint URLs (`…-enqueue`, `…-status`, `…-result`). CORS is open (`allow_origins=["*"]`) for browser clients.

## Frontend (optional)
- Static page at `frontend/index.html` (dark UI).  
- Defaults to app slug `pollinations--ltx2-comfyui-api-distilled`; override with `?app=<your-slug>` or by setting `window.COMFY_ENDPOINTS` before the script.  
- Serve locally: `cd frontend && python -m http.server 5173`.

## Notes / Troubleshooting
- Invalid `prompt_id` returns a client error from ComfyUI; the frontend will surface the message.
- Status polling interval is 3s by default.
- Ensure your Modal app name matches the slug the frontend uses; otherwise set `?app=<slug>`.
