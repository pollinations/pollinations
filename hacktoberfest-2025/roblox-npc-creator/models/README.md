# Models Folder

This folder contains the NPC model file.

## Current Status

The `NPC.rbxm` file has been copied from the original Zero-to-NPC kit.

## For Git Version Control

To use this project with Rojo and Git, you should convert the model to XML format:

1. Open `NPC.rbxm` in Roblox Studio
2. Right-click the NPC model in Explorer
3. Select "Save to File..."
4. Save as `NPC.rbxmx` (note the 'x' at the end)
5. Choose "Model File (*.rbxmx)" as the file type

## Why XML Format?

- **Git-friendly**: Text-based format shows meaningful diffs
- **Readable**: Can see changes in version control
- **Collaborative**: Easier to merge changes from multiple developers
- **Industry standard**: Used by professional Roblox developers

## Model Structure

The NPC model should contain:
- **Humanoid** - Makes it a character
- **Head** - With ClickDetector for interaction
- **Body parts** - Torso, arms, legs, etc.
- **Animations** (optional) - Idle, talk, etc.

## Customizing the NPC

You can customize the NPC appearance by:
1. Opening the model in Studio
2. Changing colors, accessories, clothing
3. Adding animations
4. Exporting back as `.rbxmx`
5. Committing to Git

The NPC's personality and behavior are controlled by the Lua scripts in `src/`, not the model file.
