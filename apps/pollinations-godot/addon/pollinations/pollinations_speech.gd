# pollinations_speech.gd
# Node that generates speech/audio using a PollinationsClient.
#
# Usage (GDScript):
#   var gen = PollinationsSpeech.new()
#   gen.client = $PollinationsClient
#   gen.prompt = "Hello, adventurer!"
#   gen.voice = "nova"
#   await gen.generate()
#   gen.audio_stream  # AudioStreamMP3

@tool
extends Node
class_name PollinationsSpeech

signal generation_started()
signal generation_completed(audio_stream)
signal generation_failed(error: String)

## Text prompt to convert to speech
@export var prompt: String = ""

## Voice name (e.g., "nova", "alloy", "echo", "fable", "onyx", "shimmer")
@export var voice: String = "nova"

## Model name (overrides client default)
@export var model: String = ""

## The generated audio stream (set after generate() completes)
var audio_stream: AudioStream

## Reference to PollinationsClient
var client: PollinationsClient

func generate() -> Promise:
	if not client:
		return Promise.reject_static("No PollinationsClient assigned")
	if prompt == "":
		return Promise.reject_static("prompt is empty")

	emit_signal("generation_started")
	var promise := client.generate_speech(prompt, voice, model)

	promise.then(func(stream):
		audio_stream = stream
		emit_signal("generation_completed", stream)
	).catch(func(err):
		emit_signal("generation_failed", err)
	)

	return promise


## Play the generated speech on an AudioStreamPlayer
func play_on(player: AudioStreamPlayer) -> void:
	if audio_stream and player:
		player.stream = audio_stream
		player.play()


## Convenience: play on an AudioStreamPlayer3D (spatial audio)
func play_on_3d(player: AudioStreamPlayer3D) -> void:
	if audio_stream and player:
		player.stream = audio_stream
		player.play()
