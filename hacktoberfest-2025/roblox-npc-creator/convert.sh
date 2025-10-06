#!/bin/bash

# Conversion Helper Script for Roblox NPC Creator
# This script helps set up the directory structure for manual conversion

echo "🔄 Roblox NPC Creator - Conversion Helper"
echo "=========================================="
echo ""

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p src/ServerScriptService
mkdir -p src/StarterPlayer/StarterPlayerScripts
mkdir -p src/StarterGui/ChatUI
mkdir -p src/ReplicatedStorage/ChatEvents
mkdir -p models

echo "✅ Directories created!"
echo ""

# Check if original model exists
ORIGINAL_MODEL="/Users/thomash/Downloads/roblox npc creator/ZerotoNPC_Model v2  (3).rbxm"

if [ -f "$ORIGINAL_MODEL" ]; then
    echo "📦 Found original model file"
    echo "   Copying to models/NPC.rbxm..."
    cp "$ORIGINAL_MODEL" models/NPC.rbxm
    echo "✅ Model copied!"
else
    echo "⚠️  Original model not found at:"
    echo "   $ORIGINAL_MODEL"
    echo "   You'll need to manually copy it to models/NPC.rbxm"
fi

echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Open Roblox Studio"
echo "2. Create a new Baseplate"
echo "3. Insert models/NPC.rbxm (Right-click Workspace → Insert from File)"
echo ""
echo "4. Export each script as .lua:"
echo "   - ChatServer → src/ServerScriptService/ChatServer.lua"
echo "   - ConfigModule → src/ServerScriptService/ConfigModule.lua"
echo "   - ChatClient → src/StarterPlayer/StarterPlayerScripts/ChatClient.lua"
echo ""
echo "5. Export NPC model as XML:"
echo "   - Right-click NPC → Save to File"
echo "   - Change type to 'Roblox XML Model Files (*.rbxmx)'"
echo "   - Save to models/NPC.rbxmx"
echo ""
echo "6. Export ChatUI:"
echo "   - Find ChatUI in StarterGui"
echo "   - Save as src/StarterGui/ChatUI.rbxmx (XML format)"
echo ""
echo "7. Test with Rojo:"
echo "   rojo serve"
echo ""
echo "See CONVERSION_GUIDE.md for detailed instructions!"
echo ""
echo "🎉 Setup complete! Happy converting!"
