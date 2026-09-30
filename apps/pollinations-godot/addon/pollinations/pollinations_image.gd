# pollinations_image.gd
# Node that generates images using a PollinationsClient.
#
# Usage (GDScript):
#   var gen = PollinationsImage.new()
#   gen.client = $PollinationsClient
#   gen.prompt = "A fantasy castle"
#   await gen.generate()
#   gen.texture  # ImageTexture

@tool
extends Node
class_name PollinationsImage

signal generation_started()
signal generation_completed(texture)
signal generation_failed(error: String)

## Image prompt / description
@export var prompt: String = ""

## Model name (overrides client default)
@export var model: String = ""

## Image dimensions
@export var width: int = 1024
@export var height: int = 1024

## Remove Pollinations logo from the image
@export var nologo: bool = true

## The generated texture (set after generate() completes)
var texture: ImageTexture

## Reference to PollinationsClient
var client: PollinationsClient

func generate() -> Promise:
	if not client:
		return Promise.reject_static("No PollinationsClient assigned")
	if prompt == "":
		return Promise.reject_static("prompt is empty")

	emit_signal("generation_started")
	var promise := client.generate_image(prompt, model, width, height, nologo)

	promise.then(func(tex):
		texture = tex
		emit_signal("generation_completed", tex)
	).catch(func(err):
		emit_signal("generation_failed", err)
	)

	return promise


## Save generated image to disk as PNG
func save_to_disk(path: String) -> bool:
	if not texture:
		return false
	var img := texture.get_image()
	var err := img.save_png(path)
	return err == OK


## Apply to a Quad or MeshInstance material
func apply_to_material(material: BaseMaterial3D) -> void:
	if texture and material:
		material.albedo_texture = texture
