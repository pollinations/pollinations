## Description

This PR adds tooltips and a legend to the pricing UI on `enter.pollinations.ai` to improve clarity, addressing issue #5912.

## Problem

Users reported confusion regarding the pricing display format (e.g., `💬0.1 /M|💾0.01 /M`):
- The `💾` (floppy disk) icon was mistaken for output cost instead of cached input cost
- The formatting of decimals (`0.1` vs `0.10`) was potentially ambiguous
- No clear explanation of what each icon represents

## Solution

1. **Added tooltips on hover** for all pricing icons (💬, 💾, 🔊, 🖼️, 🎬)
2. **Added a legend section** explaining what each pricing icon represents
3. **Improved accessibility** with `title` attributes and `cursor-help` styling

## Changes

### Modified: `enter.pollinations.ai/src/client/components/pricing/PriceBadge.tsx`
- Added `getEmojiTooltip()` function to map emojis to descriptive text
- Added `title` attributes to emoji spans for hover tooltips
- Added `cursor-help` class for better UX indication

### Modified: `enter.pollinations.ai/src/client/components/pricing/Pricing.tsx`
- Added new "Pricing icons" legend section below "Model capabilities"
- Lists all pricing icons with their meanings: 💬 input cost, 💾 cached input cost, 🔊 audio cost, 🖼️ image cost, 🎬 video cost

## User Experience Improvements

**Before:**
- Users had to guess what 💾 meant
- No explanation of pricing icons
- Confusion about cached vs regular input costs

**After:**
- Hover over any icon to see its meaning (e.g., "Cached Input Cost")
- Clear legend section explains all icons at a glance
- Better understanding of pricing structure

## Testing

- ✅ Tooltips appear on hover for all pricing icons
- ✅ Legend is visible and clearly formatted
- ✅ Consistent styling with existing UI
- ✅ Works on mobile (touch devices show tooltips on tap)

## Credits

**Developed by:** Fábio Arieira  
**Website:** https://fabioarieira.com  
**Production Projects:**
- IA-Books: https://iabooks.com.br
- ViralFlow: https://fabioarieira.com/viralflow
- Real Estate Platform: https://fabioarieira.com/imob

Full Stack Developer specializing in React, TypeScript, and modern web applications.

---

Resolves #5912
