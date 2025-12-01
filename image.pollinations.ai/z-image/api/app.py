from quart import Quart, request, Response
from quart_cors import cors
from gen_image import generate_image, find_nearest_valid_dimensions
import base64

app = Quart(__name__)
app = cors(app, allow_origin="http://localhost:9000")


@app.route('/gen', methods=['GET'])
async def gen():
    prompt = request.args.get('prompt', default='', type=str)
    width = request.args.get('width', default=512, type=int)
    height = request.args.get('height', default=512, type=int)
    seed = request.args.get('seed', default=None, type=int)
    steps = request.args.get('steps', default=9, type=int)

    
    width, height = find_nearest_valid_dimensions(
        min(width, 1024),
        min(height, 1024)
    )

    result = generate_image(
        prompt=prompt,
        width=width,
        height=height,
        steps=steps,
        seed=seed
    )

    image_data = base64.b64decode(result["image"])
    return Response(
        image_data,
        mimetype='image/jpeg',
        headers={
            "Content-Disposition": f"inline; filename={prompt[:10]}.jpg"
        }
    )

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=9000)