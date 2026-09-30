# model_catalog.gd
# Helper node that fetches and caches live model lists from Pollinations.
#
# Usage:
#   var catalog = ModelCatalog.new()
#   add_child(catalog)
#   await catalog.refresh()
#   print(catalog.text_models)  # Array of model dicts

@tool
extends Node
class_name ModelCatalog

var pollinations_client: PollinationsClient

var text_models: Array = []
var image_models: Array = []
var audio_models: Array = []

var last_updated: float = 0.0
var cache_ttl: float = 300.0  # 5 minutes

signal models_updated()

func _init(client: PollinationsClient = null):
	if client:
		pollinations_client = client

func refresh() -> Promise:
	if not pollinations_client:
		return Promise.reject_static("No PollinationsClient assigned to ModelCatalog")

	# Fetch all three model lists in parallel
	var text_promise := pollinations_client.get_models("text")
	var image_promise := pollinations_client.get_models("image")
	var audio_promise := pollinations_client.get_models("audio")

	var promise := Promise.new()

	# Wait for all three
	var results := {"text": null, "image": null, "audio": null}
	var pending := 3
	var done := false

	for type in ["text", "image", "audio"]:
		match type:
			"text":
				text_promise.then(func(models):
					if not done:
						text_models = models
						pending -= 1
						if pending == 0:
							_finish_refresh(promise)
				).catch(func(err):
					if not done:
						pending -= 1
						if pending == 0:
							_finish_refresh(promise)
				)
			"image":
				image_promise.then(func(models):
					if not done:
						image_models = models
						pending -= 1
						if pending == 0:
							_finish_refresh(promise)
				).catch(func(err):
					if not done:
						pending -= 1
						if pending == 0:
							_finish_refresh(promise)
				)
			"audio":
				audio_promise.then(func(models):
					if not done:
						audio_models = models
						pending -= 1
						if pending == 0:
							_finish_refresh(promise)
				).catch(func(err):
					if not done:
						pending -= 1
						if pending == 0:
							_finish_refresh(promise)
				)

	return promise

func _finish_refresh(promise: Promise) -> void:
	if done:
		return
	done = true
	last_updated = Time.get_unix_from_datetime(Time.get_datetime_from_unix(0))
	emit_signal("models_updated")
	promise.resolve()

func get_model_name(type: String, index: int) -> String:
	match type:
		"text":
			if index < text_models.size():
				return text_models[index].get("name", "")
		"image":
			if index < image_models.size():
				return image_models[index].get("name", "")
		"audio":
			if index < audio_models.size():
				return audio_models[index].get("name", "")
	return ""

func has_cached() -> bool:
	return text_models.size() > 0 or image_models.size() > 0 or audio_models.size() > 0
