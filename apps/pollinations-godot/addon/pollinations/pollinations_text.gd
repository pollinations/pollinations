# pollinations_text.gd
# Node that generates text using a PollinationsClient.
#
# Usage (GDScript):
#   var gen = PollinationsText.new()
#   gen.client = $PollinationsClient  # assign your PollinationsClient node
#   gen.prompt = "Tell me a joke"
#   await gen.generate()
#   print(gen.result)  # generated text

@tool
extends Node
class_name PollinationsText

signal generation_started()
signal generation_completed(text: String)
signal generation_failed(error: String)

## The prompt / user message to send
@export var prompt: String = ""

## Optional system prompt to guide the model
@export var system_prompt: String = ""

## Model name (overrides client default if set)
@export var model: String = ""

## Maximum tokens for the response
@export var max_tokens: int = 1024

## The generated text result (set after generate() completes)
var result: String = ""

## Reference to the PollinationsClient node
var client: PollinationsClient

func generate() -> Promise:
	if not client:
		return Promise.reject_static("No PollinationsClient assigned")
	if prompt == "":
		return Promise.reject_static("prompt is empty")

	emit_signal("generation_started")
	var promise := client.generate_text(prompt, model, system_prompt, max_tokens)

	promise.then(func(text):
		result = text
		emit_signal("generation_completed", text)
	).catch(func(err):
		emit_signal("generation_failed", err)
	)

	return promise


## Convenience: generate text from a prompt string
func generate_from(prompt_text: String, model_name: String = "") -> Promise:
	prompt = prompt_text
	if model_name != "":
		model = model_name
	return generate()


## Convenience: generate text from current selection (useful in editor tools)
func generate_from_selection(editor_interface) -> Promise:
	var text_edit = editor_interface.get_editor_interface().get_focus_owner()
	if text_edit and text_edit.has_method("get_selected_text"):
		var sel = text_edit.get_selected_text()
		if sel != "":
			prompt = sel
	return generate()
