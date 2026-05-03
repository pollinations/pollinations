#!/bin/bash
# Installation helper for Polly media handlers with font download

echo "🎉 Polly Media Handlers Setup Helper"
echo "===================================="
echo ""

# Check Python version
echo "📋 Checking prerequisites..."
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "✓ Python: $python_version"

# Check if in polly directory
if [ ! -f "src/bot.py" ]; then
    echo "❌ Error: Please run this from apps/polly directory"
    exit 1
fi

echo "✓ Location: Polly directory detected"
echo ""

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "⚠️  Virtual environment not found"
    echo "   Run: python -m venv venv"
    echo "        source venv/bin/activate"
    exit 1
fi

echo "✓ Virtual environment: Found"
echo ""

# Syntax check
echo "🔍 Syntax validation..."
python -m py_compile src/services/media_handlers.py 2>/dev/null && echo "✓ media_handlers.py: OK" || echo "❌ media_handlers.py: FAILED"
python -m py_compile src/bot.py 2>/dev/null && echo "✓ bot.py: OK" || echo "❌ bot.py: FAILED"
echo ""

# Font download and setup
echo "📝 Setting up fonts for table rendering..."
FONTS_DIR="assets/fonts"
mkdir -p "$FONTS_DIR"

echo "   Downloading Noto Sans fonts from Google Fonts API..."

# Fetch CSS2 from Google Fonts API with TTF variants
CSS_RESPONSE=$(curl -s "https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap")

# Extract URLs from CSS using regex
URLS=$(echo "$CSS_RESPONSE" | grep -oP 'url\(\K[^)]+' || true)

if [ -z "$URLS" ]; then
    echo "⚠️  Failed to extract font URLs from Google Fonts API (tables will use default fonts)"
else
    # Map to rename fonts based on CSS order: regular, bold, italic, bolditalic
    FONT_NAMES=("NotoSans-Regular.ttf" "NotoSans-Bold.ttf" "NotoSans-Italic.ttf" "NotoSans-BoldItalic.ttf")
    FONT_IDX=0
    
    # Download each font URL and rename appropriately
    while IFS= read -r url; do
        if [ -n "$url" ] && [ $FONT_IDX -lt 4 ]; then
            temp_file="/tmp/font_$FONT_IDX.ttf"
            target_file="$FONTS_DIR/${FONT_NAMES[$FONT_IDX]}"
            
            # Download font
            if curl -s -L "$url" -o "$temp_file" 2>/dev/null; then
                # Verify it's a valid TTF
                if file "$temp_file" 2>/dev/null | grep -q "TrueType"; then
                    mv "$temp_file" "$target_file"
                    echo "✓ Downloaded: ${FONT_NAMES[$FONT_IDX]}"
                else
                    echo "⚠️  Invalid font file, skipping"
                    rm -f "$temp_file"
                fi
            else
                echo "⚠️  Failed to download font variant"
            fi
            
            FONT_IDX=$((FONT_IDX + 1))
        fi
    done <<< "$URLS"
    
    # Check if we got enough fonts
    FONT_FILES=$(find "$FONTS_DIR" -name "NotoSans-*.ttf" -type f 2>/dev/null | wc -l)
    if [ "$FONT_FILES" -eq 0 ]; then
        echo "⚠️  No fonts downloaded (tables will use default fonts)"
    else
        echo "✓ Noto Sans fonts: $FONT_FILES / 4 variants available"
    fi
fi

echo ""

# Optional dependencies
echo "📦 Installing optional media handler dependencies..."
echo "   (Tables, LaTeX rendering)"
echo ""

pip install -q pillow pilmoji cairosvg requests 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✓ Media handlers: INSTALLED"
    echo "   - pillow (image processing)"
    echo "   - pilmoji (emoji support)"
    echo "   - cairosvg (LaTeX rendering)"
    echo "   - requests (API calls)"
else
    echo "⚠️  Some packages failed to install"
    echo "   (This is OK - code blocks will still work)"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📖 Next steps:"
echo "   1. Read QUICK_START.md for usage"
echo "   2. Run: python main.py"
echo ""
echo "🚀 Everything is ready to go!"
