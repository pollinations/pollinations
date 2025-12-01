from quart import Quart, request, Response
from gen_image import generate_image, find_nearest_valid_dimensions
import base64
import io
from PIL import Image

app = Quart(__name__)

@app.route('/gen', methods=['GET'])
async def gen():
    prompt = request.args.get('prompt', default='', type=str)
    width = request.args.get('width', default=512, type=int)
    height = request.args.get('height', default=512, type=int)
    seed = request.args.get('seed', default=None, type=int)
    width, height = find_nearest_valid_dimensions(
        min(width, 512),
        min(height, 512)
    )

    result = generate_image(
        prompt=prompt,
        width=width,
        height=height,
        seed=seed
    )

    image_data = base64.b64decode(result["image"])
    return Response(
        image_data,
        mimetype='image/jpeg',
        headers={
            "Content-Disposition": "inline; filename=generated.jpg"
        }
    )

if __name__ == "__main__":
    app.run(port=8000)