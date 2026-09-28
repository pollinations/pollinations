# pollinations_client.gd
# Core HTTP client for Pollinations API — text, image, and speech generation.
#
# Usage:
#   var client = PollinationsClient.new()
#   client.api_key = "sk_..."
#   var text = await client.generate_text("Hello, world!")
#   var tex = await client.generate_image("a fantasy castle")
#   var clip = await client.generate_speech("Hello!", "nova")

@tool
extends Node

class_name PollinationsClient

signal request_started()
signal request_completed(result: Dictionary)
signal request_failed(error: String)

## API key for authentication. Get one at https://enter.pollinations.ai/keys
var api_key: String = "":
	set(value):
		api_key = value
	get:
		return api_key

## Base URL for the Pollinations generation API
var base_url: String = "https://gen.pollinations.ai"

## Default models
var default_text_model: String = "openai/gpt-5.4-nano"
var default_image_model: String = "gptimage"
var default_speech_model: String = "openai/gpt-4o-mini-tts"
var default_voice: String = "nova"

# Internal HTTP client
var _http := HTTPRequest.new()

func _init():
	add_child(_http)
	_http.body_size_limit = 100 * 1024 * 1024  # 100 MB for image responses

func _exit_tree():
	_http.queue_free()


## Generate text via POST /v1/chat/completions
func generate_text(prompt: String, model: String = "", system_prompt: String = "", max_tokens: int = 1024) -> Promise:
	if model == "":
		model = default_text_model

	var messages: Array = []
	if system_prompt != "":
		messages.append({"role": "system", "content": system_prompt})
	messages.append({"role": "user", "content": prompt})

	var payload := JSON.stringify({
		"model": model,
		"messages": messages,
		"max_tokens": max_tokens
	})

	var headers := PackedStringArray([
		"Content-Type: application/json",
	])
	if api_key != "":
		headers.append("Authorization: Bearer " + api_key)

	var url := base_url + "/v1/chat/completions"
	var promise := Promise.new()
	_request("POST", url, headers, payload.to_utf8_buffer(), func(result):
		_handle_chat_response(result, promise)
	)
	return promise


## Generate an image via GET /image/{prompt}
func generate_image(prompt: String, model: String = "", width: int = 1024, height: int = 1024, nologo: bool = true) -> Promise:
	if model == "":
		model = default_image_model

	var url := "https://image.pollinations.ai/" + _escape_url(prompt)
	url += "?model=%s&width=%d&height=%d&nologo=%s" % [
		_escape_url(model),
		width,
		height,
		str(nologo).to_lower()
	]
	if api_key != "":
		url += "&key=" + _escape_url(api_key)

	var promise := Promise.new()
	_request_image(url, func(result):
		_handle_image_response(result, promise)
	)
	return promise


## Generate speech via GET /audio/{prompt}
func generate_speech(prompt: String, voice: String = "", model: String = "") -> Promise:
	if voice == "":
		voice = default_voice
	if model == "":
		model = default_speech_model

	var url := base_url + "/audio/" + _escape_url(prompt)
	url += "?voice=%s" % _escape_url(voice)
	if model != "":
		url += "&model=" + _escape_url(model)
	# Audio generation may cost pollen; require a key for speech
	if api_key != "":
		url += "&key=" + _escape_url(api_key)
	else:
		push_warning("No API key set — speech generation may be rate-limited or fail.")

	var promise := Promise.new()
	_request_raw(url, func(result):
		_handle_audio_response(result, promise)
	)
	return promise


## Fetch available models of a given type (text, image, audio)
func get_models(type: String = "text") -> Promise:
	var url := "%s/%s/models" % [base_url, type]
	var headers := PackedStringArray()
	if api_key != "":
		headers.append("Authorization: Bearer " + api_key)

	var promise := Promise.new()
	_request("GET", url, headers, null, func(result):
		_handle_models_response(result, promise)
	)
	return promise


# ---- Internal HTTP helpers ----

func _request(method: String, url: String, headers: PackedStringArray, body, callback: Callable) -> void:
	emit_signal("request_started")
	var err := _http.request(url, headers, method == "POST", body, false, true)
	if err != OK:
		push_error("HTTP request failed to start: %s — %s" % [url, str(err)])
		callback({"error": str(err), "status": 0, "body": ""})
		return

	# Wait for response
	var conn := _http.connect("request_completed", callable(self, "_on_request_done").bind(callback))
	# Note: in production, the signal handler processes the response

func _request_image(url: String, callback: Callable) -> void:
	# Use a separate HTTPRequest for binary image responses
	var img_http := HTTPRequest.new()
	add_child(img_http)
	img_http.body_size_limit = 50 * 1024 * 1024
	img_http.request_completed.connect(func(result, response_code, headers, body):
		img_http.queue_free()
		callback({"body": body, "status": response_code, "headers": headers}
	))
	img_http.request(url)

func _request_raw(url: String, callback: Callable) -> void:
	var raw_http := HTTPRequest.new()
	add_child(raw_http)
	raw_http.body_size_limit = 50 * 1024 * 1024
	raw_http.request_completed.connect(func(result, response_code, headers, body):
		raw_http.queue_free()
		callback({"body": body, "status": response_code, "headers": headers}
	))
	raw_http.request(url)


func _on_request_done(result: int, response_code: int, headers: PackedStringArray, body: PackedVector8Array, callback: Callable) -> void:
	var body_str := ""
	if body.size() > 0:
		body_str = body.get_string_from_utf8()
	callback({"body": body_str, "status": response_code, "headers": headers, "result": result})


func _handle_chat_response(resp: Dictionary, promise: Promise) -> void:
	if resp.has("error"):
		promise.reject(resp["error"])
		return

	var status := resp["status"]
	if status >= 400:
		promise.reject("HTTP %d: %s" % [status, resp["body"]])
		return

	var data := JSON.parse_string(resp["body"])
	if data.error != OK:
		promise.reject("Failed to parse response: %s" % data.error_string)
		return

	var result := data.result
	if result.has("choices") and result.choices.size() > 0:
		var content := result.choices[0].message.content
		promise.resolve(content)
	else:
		var msg := result.get("error", {}).get("message", "No content in response") if result.has("error") else "No content"
		promise.reject("No content: %s" % str(msg))


func _handle_image_response(resp: Dictionary, promise: Promise) -> void:
	var status := resp["status"]
	if status >= 400:
		promise.reject("HTTP %d" % status)
		return

	var body: PackedVector8Array = resp["body"]
	if body.size() == 0:
		promise.reject("Empty image response")
		return

	var img := Image.new()
	var err := img.load_png_from_buffer(body)
	if err == OK:
		var tex := ImageTexture.new()
		tex.set_image(img)
		promise.resolve(tex)
	else:
		var jpg_err := img.load_jpg_from_buffer(body)
		if jpg_err == OK:
			var tex := ImageTexture.new()
			tex.set_image(img)
			promise.resolve(tex)
		else:
			promise.reject("Failed to decode image: %s / %s" % [str(err), str(jpg_err)])


func _handle_audio_response(resp: Dictionary, promise: Promise) -> void:
	var status := resp["status"]
	if status >= 400:
		promise.reject("HTTP %d" % status)
		return

	var body: PackedVector8Array = resp["body"]
	if body.size() == 0:
		promise.reject("Empty audio response")
		return

	var clip := AudioStreamMP3.new()
	clip.data = body
	if not clip._play(0, 1.0):
		promise.reject("Failed to load audio stream")
		return
	promise.resolve(clip)


func _handle_models_response(resp: Dictionary, promise: Promise) -> void:
	var status := resp["status"]
	if status >= 400:
		promise.reject("HTTP %d" % status)
		return

	var data := JSON.parse_string(resp["body"])
	if data.error != OK:
		promise.reject("Failed to parse models: %s" % data.error_string)
		return

	var models: Array = []
	if data.result is Array:
		for m in data.result:
			if m is Dictionary and m.has("name"):
				models.append(m)
	promise.resolve(models)


func _escape_url(s: String) -> String:
	return s.uri_encode()
