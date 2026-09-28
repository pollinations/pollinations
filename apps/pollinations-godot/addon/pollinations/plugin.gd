# plugin.gd
# Godot 4 plugin entry point — adds Pollinations nodes to the editor.

@tool
extends EditorPlugin

func _enter_tree():
	# Register custom classes so they appear in the Create Node dialog
	print("Pollinations: plugin loaded")

	# Make core classes available
	if not Engine.is_editor_hint():
		return

	# Add a toolbar button to quickly open the sample scene
	var ui = get_editor_interface().get_base_control()
	var button = EditorInterface.get_base_control().add_child(
		preload("res://addons/pollinations/demo_button.tscn").instantiate()
	) if ResourceLoader.exists("res://addons/pollinations/demo_button.tscn") else null

func _exit_tree():
	print("Pollinations: plugin unloaded")

func get_plugin_name() -> String:
	return "Pollinations AI"

func has_main_screen() -> bool:
	return false
