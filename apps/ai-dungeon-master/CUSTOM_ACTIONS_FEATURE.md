# 🎭 Custom Text Actions Feature

## 🆕 **New Feature: Custom Player Responses**

Players can now input their own custom text responses alongside the predefined choices, providing unlimited freedom for creative storytelling and character interaction!

### ✨ **What's New**

#### **Two Input Modes**
1. **Quick Action Mode**: Single-line input for short actions
   - Perfect for: "Look behind the door", "Ask about the treasure", "Cast a protection spell"
   - Enter key to submit for quick gameplay

2. **Detailed Response Mode**: Multi-line textarea for complex interactions
   - Perfect for: Character dialogue, detailed actions, roleplay descriptions
   - Up to 500 characters for rich storytelling
   - Manual submit button for deliberate actions

#### **Seamless Integration**
- **Collapsible Interface**: Custom input section expands/collapses on demand
- **Visual Hierarchy**: Clear separation between predefined choices and custom actions
- **AI Integration**: Custom text is processed exactly like predefined choices
- **Loading States**: Disabled during AI processing to prevent conflicts

### 🎮 **How to Use**

#### **Step 1: Access Custom Actions**
- Look for the "Custom Action" button below the predefined choices
- Click to expand the custom input area

#### **Step 2: Choose Your Input Mode**
- **Quick Action**: For simple, direct actions
- **Detailed Response**: For complex interactions and dialogue

#### **Step 3: Enter Your Action**
- **Quick Mode**: Type your action and press Enter or click Send
- **Detailed Mode**: Write your response and click "Send Action"

#### **Examples of Custom Actions**

**Quick Actions:**
- "Search for hidden switches"
- "Whisper to my companion"
- "Check the ancient tome"
- "Listen for footsteps"

**Detailed Responses:**
- "I approach the mysterious figure cautiously, keeping my hand on my sword hilt. 'Who goes there?' I call out in a firm but not aggressive tone, ready to defend myself if needed."
- "Drawing upon my magical training, I cast a detect magic spell to sense any enchantments in the area while staying alert for any signs of danger."

### 🔧 **Technical Implementation**

#### **Component Architecture**
```typescript
interface ChoicesSectionProps {
    choices: Choice[];
    onChoiceSelect: (choiceId: string) => void;
    onCustomAction?: (text: string) => void;  // New prop
    isLoading?: boolean;                      // New prop
}
```

#### **State Management**
- **Expandable UI**: Toggle between collapsed/expanded states
- **Input Modes**: Switch between quick action and detailed response
- **Form Validation**: Ensures non-empty submissions
- **Loading Handling**: Prevents multiple submissions during AI processing

#### **AI Integration**
- Custom text is passed to the same AI story generation system
- Processed identically to predefined choices for consistent experience
- Maintains full context and character continuity

### 🎨 **UI/UX Features**

#### **Visual Design**
- **Medieval Theme**: Consistent with game's fantasy aesthetic
- **Color Scheme**: Uses the same brown/gold color palette
- **Interactive Elements**: Hover effects and smooth transitions
- **Responsive**: Works on both desktop and mobile devices

#### **User Experience**
- **Progressive Disclosure**: Custom options appear only when needed
- **Clear Affordances**: Visual cues for different interaction modes
- **Immediate Feedback**: Button states reflect loading/disabled states
- **Helpful Tips**: Contextual guidance for using custom actions

### 💡 **Tips for Players**

#### **Making the Most of Custom Actions**
1. **Be Specific**: Detailed actions get better AI responses
2. **Stay in Character**: Consider your character's class, background, and personality
3. **Think Creatively**: Use custom actions for unique solutions to challenges
4. **Mix and Match**: Combine predefined choices with custom actions throughout your adventure

#### **Example Scenarios**

**Exploration:**
- Instead of "Explore surroundings" → "Carefully examine the strange runes carved into the wall"

**Combat:**
- Instead of "Attack" → "Feint with my sword to distract the enemy, then strike at their weak point"

**Social Interaction:**
- Instead of "Talk" → "I bow respectfully and introduce myself as a traveling scholar seeking knowledge"

### 🚀 **Benefits**

#### **For Players**
- **Unlimited Creativity**: Express exactly what you want your character to do
- **Deeper Immersion**: More personal connection to story choices
- **Unique Stories**: Every playthrough becomes truly unique
- **Character Agency**: Full control over character actions and dialogue

#### **For Storytelling**
- **Dynamic Narratives**: AI responds to player creativity with unique content
- **Emergent Gameplay**: Unexpected story directions from creative player input
- **Personalized Experience**: Adventures shaped by individual player imagination
- **Infinite Possibilities**: No longer limited to predefined story paths

### 🔄 **Future Enhancements**

#### **Planned Improvements**
- **Smart Suggestions**: AI-powered action suggestions based on context
- **Action History**: Remember frequently used custom actions
- **Character Voice**: Customize writing style based on character class
- **Collaborative Mode**: Share custom actions with other players

#### **Advanced Features**
- **Skill-Based Actions**: Different options based on character abilities
- **Contextual Prompts**: Helpful suggestions based on current scene
- **Natural Language Processing**: Better understanding of player intent
- **Voice Input**: Speak your actions for hands-free play

---

**🎭 Now every player can truly become the author of their own adventure! ✨**