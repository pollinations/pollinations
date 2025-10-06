# Models Folder

This folder contains the NPC model in XML format (`.rbxmx`).

## Why XML Format?

- **Git-friendly**: Text-based format shows meaningful diffs
- **Readable**: Can see changes in version control
- **Collaborative**: Easier to merge changes from multiple developers
- **Rojo compatible**: Works seamlessly with Rojo sync

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
