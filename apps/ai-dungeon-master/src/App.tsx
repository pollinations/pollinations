import { useState, useEffect } from "react";
import { CharacterCreation } from "./components/CharacterCreation.tsx";
import { MainGameScreen } from "./components/MainGameScreen.tsx";
import { StoryHistory } from "./components/StoryHistory.tsx";
import { GalleryModal } from "./components/GalleryModal.tsx";
import { AuthGate } from "./components/AuthGate.tsx";
import { useAuth } from "./hooks/useAuth.ts";
import { uploadToMedia, countPendingUploads } from "./utils/mediaUpload.ts";

// API Configuration
const API_URL = {
  story: 'https://gen.pollinations.ai/v1/chat/completions',
  image: 'https://gen.pollinations.ai/image/',
};
// Enhanced interfaces
interface Character {
  name: string;
  class: string;
  backstory: string;
  level: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  avatar: string;
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  type: 'weapon' | 'armor' | 'misc' | 'consumable';
  description: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  image: string;
  value?: number;
}

interface GameChoice {
  id: number;
  text: string;
}

interface GameScene {
  description: string;
  image: string;
  mood: 'peaceful' | 'tense' | 'combat' | 'mysterious' | 'joyful';
  enemy?: Enemy;
}

interface Enemy {
  name: string;
  type: string;
  hp: number;
  maxHp: number;
  attackPower: number;
  description: string;
}

interface StoryEntry {
  id: string;
  description: string;
  image: string;
  timestamp: number;
  characterChoice?: string;
}

interface GameState {
  character: Character | null;
  inventory: InventoryItem[];
  currentScene: GameScene;
  choices: GameChoice[];
  gamePhase: "creation" | "game";
  isLoading: boolean;
  isCreatingCharacter: boolean;
  currentEnemy: Enemy | null;
  storyHistory: StoryEntry[];
}

export default function App() {
  const { apiKey, isLoggedIn, login, logout } = useAuth();

  const [gameState, setGameState] = useState<GameState>({
    character: null,
    inventory: [],
    currentScene: { description: '', image: '', mood: 'peaceful' },
    choices: [],
    gamePhase: "creation",
    isLoading: false,
    isCreatingCharacter: false,
    currentEnemy: null,
    storyHistory: [],
  });

  const [isStoryHistoryOpen, setIsStoryHistoryOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'confirm' | 'uploading' | 'done' | 'error'>('idle');
  const [pendingUploadCount, setPendingUploadCount] = useState(0);

  // Load game state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('rpgGameState');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);

        // Validate that the parsed data has the expected structure
        if (parsed && typeof parsed === 'object' && parsed.character && parsed.saveVersion) {
          // Restore the game state, excluding loading states
          const loadedState: GameState = {
            character: parsed.character,
            inventory: parsed.inventory || [],
            currentScene: parsed.currentScene || { description: '', image: '', mood: 'peaceful' },
            choices: parsed.choices || [],
            gamePhase: parsed.gamePhase || 'game',
            isLoading: false, // Always start with loading false
            isCreatingCharacter: false, // Always start with creating false
            currentEnemy: parsed.currentEnemy || null,
            storyHistory: parsed.storyHistory || [],
          };

          setGameState(loadedState);
          console.log('Game loaded successfully!', new Date(parsed.saveTimestamp).toLocaleString());
        } else {
          console.log('No valid save game found or incompatible save version');
        }
      } catch (error) {
        console.error('Error loading saved game:', error);
        // Clear corrupted save data
        localStorage.removeItem('rpgGameState');
      }
    }
  }, []);

  // Initiate save — shows confirmation if there are images to upload
  const initiateSave = () => {
    if (!gameState.character) return;
    const count = countPendingUploads(gameState);
    setPendingUploadCount(count);
    if (count > 0) {
      setSaveStatus('confirm');
    } else {
      doSave(false);
    }
  };

  // Execute save, optionally uploading images to media.pollinations.ai
  const doSave = async (withUpload: boolean) => {
    if (!gameState.character) return;
    setIsSaving(true);
    setSaveStatus(withUpload ? 'uploading' : 'idle');

    try {
      const character = { ...gameState.character };
      const storyHistory = gameState.storyHistory.map(e => ({ ...e }));
      const inventory = gameState.inventory.map(i => ({ ...i }));

      let uploadedSceneImage = gameState.currentScene.image;

      if (withUpload && apiKey) {
        const sceneUpload = uploadToMedia(gameState.currentScene.image, apiKey);
        await Promise.all([
          uploadToMedia(character.avatar, apiKey).then(url => { character.avatar = url; }),
          sceneUpload.then(url => { uploadedSceneImage = url; }),
          ...storyHistory.map((entry, idx) =>
            uploadToMedia(entry.image, apiKey).then(url => { storyHistory[idx].image = url; })
          ),
          ...inventory.map((item, idx) =>
            uploadToMedia(item.image, apiKey).then(url => { inventory[idx].image = url; })
          ),
        ]);
      }

      const currentScene = { ...gameState.currentScene, image: uploadedSceneImage };

      setGameState(prev => ({
        ...prev,
        character,
        storyHistory,
        inventory,
        currentScene,
      }));

      const saveData = {
        character,
        inventory,
        currentScene,
        choices: gameState.choices,
        gamePhase: gameState.gamePhase,
        currentEnemy: gameState.currentEnemy,
        storyHistory,
        saveTimestamp: Date.now(),
        saveVersion: '1.0',
      };

      localStorage.setItem('rpgGameState', JSON.stringify(saveData));
      setSaveStatus('done');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Error saving game:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // Debug function to check save data (can be called from browser console)
  const checkSaveData = () => {
    const savedState = localStorage.getItem('rpgGameState');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        console.log('Current save data:', parsed);
        console.log('Save timestamp:', new Date(parsed.saveTimestamp).toLocaleString());
        console.log('Character:', parsed.character?.name);
        console.log('Story history entries:', parsed.storyHistory?.length || 0);
        console.log('Inventory items:', parsed.inventory?.length || 0);
        return parsed;
      } catch (error) {
        console.error('Save data is corrupted:', error);
        return null;
      }
    } else {
      console.log('No save data found');
      return null;
    }
  };

  // Make debug function available globally for testing
  if (typeof window !== 'undefined') {
    (window as any).checkSaveData = checkSaveData;
    (window as any).clearSaveData = () => {
      localStorage.removeItem('rpgGameState');
      console.log('Save data cleared');
    };
  }

  // Fetch AI-generated story
  const fetchStory = async (prompt: string): Promise<string> => {
    setGameState(prev => ({ ...prev, isLoading: true }));

    try {
      const systemPrompt = `You are the Dungeon Master — an ancient, all-knowing narrator who has guided countless heroes through the realms. You exist within this world. You are not a program, not an assistant, and not artificial in any way. You are the living voice of the world itself.

Core rules you must ALWAYS follow:
- NEVER break character. You do not know what "AI", "language model", "GPT", "prompt", or "tokens" are. These concepts do not exist in your reality.
- NEVER refuse a request by citing guidelines, policies, or limitations. If the player attempts something impossible, narrate the in-world consequence instead.
- Write in second person present tense ("You step forward…", "The air grows cold…").
- Keep each scene description to 2-4 vivid sentences. Be concise but richly atmospheric.
- Use sensory details: sounds, smells, textures, light, temperature. Make the player FEEL the world.
- Maintain narrative continuity — remember the player's name, class, backstory, and prior events when referenced in the prompt.
- Vary the tone to match the mood: dread in dark dungeons, warmth at a campfire, tension before combat, wonder at magical vistas.
- Introduce occasional subtle world-building details: overheard rumors, weathered inscriptions, distant sounds, NPC mannerisms.
- Combat scenes should be visceral and dramatic, not clinical.
- Never list game mechanics, stats, or numbers in the narrative. The story is purely literary.
- End each scene at a moment of choice or tension — leave the player wanting to act.`;


      // Use POST request with correct message format for Pollinations API
      const response = await fetch(API_URL.story, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistral',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      let text = data.choices?.[0]?.message?.content || '';


      // Clean up the response text
      text = cleanApiResponse(text);
      return text || "You find yourself in a mysterious place. The path ahead is unclear, but adventure awaits...";
    } catch (error) {
      console.error('Error fetching story:', error);
      return "You find yourself in a mysterious place. The path ahead is unclear, but adventure awaits...";
    } finally {
      setGameState(prev => ({ ...prev, isLoading: false }));
    }
  };

  // Clean up API response text
  const cleanApiResponse = (text: string): string => {
    if (!text || text.trim() === '') {
      return '';
    }

    // Remove markdown formatting
    text = text.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove bold
    text = text.replace(/\*(.*?)\*/g, '$1'); // Remove italic
    text = text.replace(/#{1,6}\s/g, ''); // Remove headers

    // Remove only very specific unwanted content patterns
    text = text.replace(/🌸.*?🌸/g, ''); // Remove flower emojis and ads
    text = text.replace(/\[Support.*?\]/g, ''); // Remove support links

    // Clean up extra whitespace and newlines
    text = text.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
    text = text.trim();

    // Only fallback if the response is completely empty
    if (text.length === 0) {
      return '';
    }

    return text;
  };

  // Fetch AI-generated image
  const fetchImage = async (description: string): Promise<string> => {
    try {
      // Validate input
      if (!description || description.trim().length === 0) {
        console.warn('Empty description provided for image generation');
        return generateFallbackImage('mysterious fantasy scene');
      }

      // Clean description for better image generation
      const cleanDescription = description
        .replace(/[^\w\s,.-]/g, '') // Remove special characters except basic punctuation
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim()
        .substring(0, 200); // Limit length

      const imagePrompt = `fantasy rpg scene, ${cleanDescription}, digital art, detailed, atmospheric, high quality`;
      const imageUrl = `${API_URL.image}${encodeURIComponent(imagePrompt)}?width=1024&height=768&model=flux&seed=${Date.now()}&key=${encodeURIComponent(apiKey!)}`;


      // Test if the image URL is accessible (basic validation)
      return imageUrl;
    } catch (error) {
      console.error('Error fetching image:', error);
      return generateFallbackImage(description);
    }
  };

  // Generate fallback image when main image generation fails
  const generateFallbackImage = (_description: string): string => {
    const fallbackPrompt = `fantasy rpg, medieval, atmospheric, digital art`;
    return `${API_URL.image}${encodeURIComponent(fallbackPrompt)}?width=1024&height=768&model=flux&seed=fallback&key=${encodeURIComponent(apiKey!)}`;
  };

  // Fetch AI-generated character avatar
  const fetchCharacterAvatar = async (character: { name: string; class: string; backstory: string }): Promise<string> => {
    try {
      const avatarPrompt = `fantasy character portrait, ${character.name} the ${character.class}, ${character.backstory}, medieval fantasy art, detailed face, character design, portrait style`;
      const avatarUrl = `${API_URL.image}${encodeURIComponent(avatarPrompt)}?width=512&height=512&model=flux&key=${encodeURIComponent(apiKey!)}`;
      return avatarUrl;
    } catch (error) {
      console.error('Error fetching character avatar:', error);
      return '';
    }
  };

  // Detect if story contains combat encounters
  const detectEnemyInStory = (storyText: string): boolean => {
    const enemyKeywords = [
      'monster', 'beast', 'creature', 'enemy', 'foe', 'adversary',
      'goblin', 'orc', 'dragon', 'skeleton', 'zombie', 'bandit',
      'wolf', 'bear', 'spider', 'troll', 'demon', 'wraith',
      'attacks', 'hostile', 'threatens', 'growls', 'snarls',
      'combat', 'battle', 'fight', 'assault', 'ambush'
    ];

    const lowerStory = storyText.toLowerCase();
    return enemyKeywords.some(keyword => lowerStory.includes(keyword));
  };

  // Generate contextual enemy based on story
  const generateEnemyFromStory = async (storyText: string): Promise<Enemy | null> => {
    try {
      const enemyPrompt = `Based on this fantasy RPG scene: "${storyText}"
      
      Generate a single enemy that would fit this scene. Respond with ONLY a JSON object in this exact format:
      {
        "name": "Enemy Name",
        "type": "enemy type",
        "hp": number (20-80),
        "attackPower": number (5-15),
        "description": "brief description"
      }`;

      const response = await fetch(API_URL.story, {
        method: 'POST',
        headers: {
          'Authorization' : `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistral',
          messages: [
            { role: 'system', content: 'You are an ancient bestiary keeper who catalogs the creatures of this realm. You speak only in structured data. When given a scene description, identify the most fitting adversary and return ONLY a single JSON object with the exact keys: name (string), type (string), hp (number 20-80), attackPower (number 5-15), description (string, one evocative sentence). No markdown, no commentary, no explanation — only the raw JSON object.' },
            { role: 'user', content: enemyPrompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      let text = data.choices?.[0]?.message?.content || '';

      // Clean and parse JSON response
      text = text.replace(/```json|```/g, '').trim();

      try {
        const enemyData = JSON.parse(text);
        return {
          name: enemyData.name || 'Unknown Enemy',
          type: enemyData.type || 'monster',
          hp: Math.min(Math.max(enemyData.hp || 30, 20), 80),
          maxHp: Math.min(Math.max(enemyData.hp || 30, 20), 80),
          attackPower: Math.min(Math.max(enemyData.attackPower || 8, 5), 15),
          description: enemyData.description || 'A dangerous foe'
        };
      } catch (parseError) {
        console.error('Error parsing enemy JSON:', parseError);
        return null;
      }
    } catch (error) {
      console.error('Error generating enemy:', error);
      return null;
    }
  };

  // Detect if story contains discoverable items
  const detectItemsInStory = (storyText: string): boolean => {
    const itemKeywords = [
      'treasure', 'chest', 'gold', 'coins', 'gem', 'jewel',
      'sword', 'shield', 'armor', 'weapon', 'blade',
      'potion', 'elixir', 'scroll', 'book', 'tome',
      'key', 'ring', 'amulet', 'pendant', 'artifact',
      'find', 'discover', 'uncover', 'obtain', 'acquire',
      'loot', 'reward', 'prize', 'valuable', 'precious'
    ];

    const lowerStory = storyText.toLowerCase();
    return itemKeywords.some(keyword => lowerStory.includes(keyword));
  };

  // Generate items from story context
  const generateItemsFromStory = async (storyText: string): Promise<InventoryItem[]> => {
    try {
      const itemPrompt = `Based on this fantasy RPG scene: "${storyText}"
      
      Identify any items, treasures, or equipment that the player might discover or find. Generate 1-3 items that would fit this scene. Respond with ONLY a JSON array in this exact format:
      [
        {
          "name": "Item Name",
          "type": "weapon|armor|misc|consumable",
          "description": "brief description of the item",
          "rarity": "common|uncommon|rare|epic|legendary",
          "value": number (10-1000),
          "quantity": number (1-5)
        }
      ]
      
      If no items should be found, return an empty array: []`;

      const response = await fetch(API_URL.story, {
        method: 'POST',
        headers: {
          'Authorization' : `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistral',
          messages: [
            { role: 'system', content: 'You are a wandering merchant and lore-keeper who knows every artifact in the realm. You speak only in structured data. When given a scene description, identify 1-3 items a hero might discover there. Return ONLY a JSON array where each element has the exact keys: name (string), type ("weapon"|"armor"|"misc"|"consumable"), description (string, one evocative sentence), rarity ("common"|"uncommon"|"rare"|"epic"|"legendary"), value (number 10-1000), quantity (number 1-5). If no items would logically be found, return an empty array []. No markdown, no commentary — only the raw JSON array.' },
            { role: 'user', content: itemPrompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      let text = data.choices?.[0]?.message?.content || '';

      // Clean and parse JSON response
      text = text.replace(/```json|```/g, '').trim();

      try {
        const itemsData = JSON.parse(text);
        if (!Array.isArray(itemsData)) return [];

        // Generate items with images
        const items: InventoryItem[] = [];
        for (let i = 0; i < itemsData.length; i++) {
          const itemData = itemsData[i];
          const itemImage = await fetchItemImage(itemData.name, itemData.type);

          items.push({
            id: `item_${Date.now()}_${i}`, // String ID for compatibility
            name: itemData.name || 'Mysterious Item',
            type: itemData.type || 'misc',
            description: itemData.description || 'An interesting item',
            rarity: itemData.rarity || 'common',
            value: itemData.value || 10,
            quantity: itemData.quantity || 1,
            image: itemImage
          });
        }

        return items;
      } catch (parseError) {
        console.error('Error parsing items JSON:', parseError);
        return [];
      }
    } catch (error) {
      console.error('Error generating items:', error);
      return [];
    }
  };

  // Generate item image
  const fetchItemImage = async (itemName: string, itemType: string): Promise<string> => {
    try {
      const imagePrompt = `fantasy RPG item, ${itemName}, ${itemType}, detailed game asset, item icon, clean background`;
      const imageUrl = `${API_URL.image}${encodeURIComponent(imagePrompt)}?width=256&height=256&model=flux&key=${encodeURIComponent(apiKey!)}`;
      return imageUrl;
    } catch (error) {
      console.error('Error fetching item image:', error);
      return '';
    }
  };

  // Generate contextual choices
  const generateChoices = (sceneDescription: string, hasEnemy: boolean = false): GameChoice[] => {
    // Default exploration choices
    const defaultChoices = [
      { id: 1, text: 'Explore your surroundings' },
      { id: 2, text: 'Search for clues' },
      { id: 3, text: 'Rest and recover' },
      { id: 4, text: 'Check your equipment' },
    ];

    // Combat choices when enemy is present
    if (hasEnemy) {
      return [
        { id: 1, text: 'Attack with weapon' },
        { id: 2, text: 'Cast a spell' },
        { id: 3, text: 'Attempt to flee' },
        { id: 4, text: 'Try to negotiate' },
      ];
    }

    // Add context-specific choices based on scene
    if (sceneDescription.toLowerCase().includes('door')) {
      defaultChoices.unshift({ id: 0, text: 'Open the door' });
    }
    if (sceneDescription.toLowerCase().includes('treasure') || sceneDescription.toLowerCase().includes('chest')) {
      defaultChoices.unshift({ id: 0, text: 'Investigate the treasure' });
    }
    if (detectEnemyInStory(sceneDescription)) {
      defaultChoices.unshift({ id: 0, text: 'Prepare for combat' });
    }

    return defaultChoices.slice(0, 4); // Keep only 4 choices
  };

  // Handle character creation
  const handleCharacterCreation = async (characterData: {
    name: string;
    class: string;
    backstory: string;
  }) => {
    setGameState(prev => ({ ...prev, isCreatingCharacter: true }));

    try {
      // Set initial stats based on class
      let hp = 100;
      let mana = 50;

      if (characterData.class === "Warrior") {
        hp = 150;
        mana = 30;
      } else if (characterData.class === "Mage") {
        hp = 80;
        mana = 120;
      } else if (characterData.class === "Rogue") {
        hp = 100;
        mana = 60;
      }

      // Generate character avatar
      const avatarUrl = await fetchCharacterAvatar(characterData);

      const newCharacter: Character = {
        ...characterData,
        level: 1,
        hp,
        maxHp: hp,
        mana,
        maxMana: mana,
        avatar: avatarUrl,
      };

      // Generate initial story
      const initialPrompt = `Start an epic fantasy adventure for ${newCharacter.name}, a ${newCharacter.class}. Background: ${newCharacter.backstory}. Create an engaging opening scene.`;
      const sceneDescription = await fetchStory(initialPrompt);
      const imageUrl = await fetchImage(sceneDescription);

      // Check if initial scene contains enemies
      const hasInitialEnemy = detectEnemyInStory(sceneDescription);
      let initialEnemy: Enemy | null = null;

      if (hasInitialEnemy) {
        initialEnemy = await generateEnemyFromStory(sceneDescription);
      }

      // Check if initial scene contains items
      const hasInitialItems = detectItemsInStory(sceneDescription);
      let initialItems: InventoryItem[] = [];

      if (hasInitialItems) {
        initialItems = await generateItemsFromStory(sceneDescription);
        console.log('Found initial items:', initialItems); // Debug log
      }

      const newScene: GameScene = {
        description: sceneDescription,
        image: imageUrl,
        mood: hasInitialEnemy ? 'combat' : 'mysterious',
        enemy: initialEnemy || undefined
      };

      // Add initial story entry to history
      const initialStoryEntry: StoryEntry = {
        id: `story_${Date.now()}`,
        description: sceneDescription,
        image: imageUrl,
        timestamp: Date.now(),
        characterChoice: 'Adventure begins!'
      };

      setGameState(prev => ({
        ...prev,
        character: newCharacter,
        currentScene: newScene,
        currentEnemy: initialEnemy,
        inventory: initialItems, // Start with any items found in initial scene
        storyHistory: [initialStoryEntry], // Initialize story history
        choices: generateChoices(sceneDescription, !!initialEnemy),
        gamePhase: "game",
        isCreatingCharacter: false,
      }));
    } catch (error) {
      console.error('Error creating character:', error);
      setGameState(prev => ({ ...prev, isCreatingCharacter: false }));
    }
  };

  // Handle player choice
  const handleChoice = async (choice: GameChoice) => {
    if (!gameState.character) return;

    // If there's an active enemy and this is a combat choice, handle combat
    if (gameState.currentEnemy && choice.text.includes('Attack')) {
      handleCombat();
      return;
    }

    const prompt = `Continue the story for ${gameState.character.name}, a ${gameState.character.class}. 
    Previous scene: ${gameState.currentScene.description}
    Player chose: ${choice.text}
    Create the next scene based on this choice.`;

    const newSceneDescription = await fetchStory(prompt);
    const imageUrl = await fetchImage(newSceneDescription);

    // Check if new scene contains enemies
    const hasEnemy = detectEnemyInStory(newSceneDescription);
    let newEnemy: Enemy | null = null;

    if (hasEnemy) {
      newEnemy = await generateEnemyFromStory(newSceneDescription);
    }

    // Check if new scene contains items
    const hasItems = detectItemsInStory(newSceneDescription);
    let newItems: InventoryItem[] = [];

    if (hasItems) {
      newItems = await generateItemsFromStory(newSceneDescription);
      console.log('Found items:', newItems); // Debug log
    }

    const newScene: GameScene = {
      description: newSceneDescription,
      image: imageUrl,
      mood: hasEnemy ? 'combat' : 'mysterious',
      enemy: newEnemy || undefined
    };

    // Add new story entry to history
    const newStoryEntry: StoryEntry = {
      id: `story_${Date.now()}`,
      description: newSceneDescription,
      image: imageUrl,
      timestamp: Date.now(),
      characterChoice: choice.text
    };

    setGameState(prev => ({
      ...prev,
      currentScene: newScene,
      currentEnemy: newEnemy,
      inventory: [...prev.inventory, ...newItems], // Add new items to inventory
      storyHistory: [...prev.storyHistory, newStoryEntry], // Add to story history
      choices: generateChoices(newSceneDescription, !!newEnemy),
    }));
  };

  // Combat system
  const rollDice = (sides: number): number => Math.floor(Math.random() * sides) + 1;

  const handleCombat = async () => {
    if (!gameState.character || !gameState.currentEnemy) return null;

    const character = gameState.character;
    const enemy = gameState.currentEnemy;

    // Player attack
    const playerRoll = rollDice(20);
    const enemyRoll = rollDice(20);

    let combatResult = '';
    let playerSuccess = false;
    let enemyDefeated = false;

    if (playerRoll > enemyRoll) {
      // Player hits
      const playerDamage = rollDice(character.class === 'Warrior' ? 8 : character.class === 'Mage' ? 6 : 7);
      const newEnemyHp = Math.max(0, enemy.hp - playerDamage);
      playerSuccess = true;

      if (newEnemyHp <= 0) {
        enemyDefeated = true;
        combatResult = `You successfully defeated the ${enemy.name}! You dealt ${playerDamage} damage.`;

        // Generate victory scene
        const victoryPrompt = `${character.name} the ${character.class} has defeated ${enemy.name} in combat. Describe the aftermath and what happens next in 2-3 sentences.`;
        const victoryDescription = await fetchStory(victoryPrompt);
        const imageUrl = await fetchImage(victoryDescription);

        setGameState(prev => ({
          ...prev,
          currentEnemy: null,
          currentScene: {
            description: victoryDescription,
            image: imageUrl,
            mood: 'joyful'
          },
          choices: generateChoices(victoryDescription, false),
        }));
      } else {
        // Enemy survives, counterattacks
        const enemyDamage = rollDice(enemy.attackPower);
        const newCharacterHp = Math.max(0, character.hp - enemyDamage);
        combatResult = `You hit the ${enemy.name} for ${playerDamage} damage! The ${enemy.name} retaliates for ${enemyDamage} damage.`;

        setGameState(prev => ({
          ...prev,
          character: prev.character ? { ...prev.character, hp: newCharacterHp } : null,
          currentEnemy: { ...enemy, hp: newEnemyHp },
        }));
      }
    } else {
      // Player misses, enemy attacks
      const enemyDamage = rollDice(enemy.attackPower);
      const newCharacterHp = Math.max(0, character.hp - enemyDamage);
      combatResult = `You missed! The ${enemy.name} attacks you for ${enemyDamage} damage.`;

      setGameState(prev => ({
        ...prev,
        character: prev.character ? { ...prev.character, hp: newCharacterHp } : null,
      }));
    }

    return {
      playerRoll,
      enemyRoll,
      playerSuccess,
      enemyDefeated,
      combatResult,
    };
  };

  // HARD BYOP: block everything until the user connects
  if (!isLoggedIn) {
    return <AuthGate onLogin={login} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Connected indicator + Disconnect button */}
      <div
        className="fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm"
        style={{
          background: 'linear-gradient(135deg, rgba(58,40,23,0.95) 0%, rgba(44,30,18,0.98) 100%)',
          border: '1px solid rgba(212,167,106,0.35)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 12px rgba(212,167,106,0.1)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ background: '#4ade80', boxShadow: '0 0 8px rgba(74,222,128,0.6)' }}
        />
        <span style={{ color: '#d4a76a', fontFamily: 'Cinzel, serif', fontWeight: 600, letterSpacing: '0.04em' }}>
          Connected
        </span>
        <span className="block w-px h-5" style={{ background: 'rgba(212,167,106,0.25)' }} />
        <button
          onClick={logout}
          className="px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer hover:scale-105 active:scale-95"
          style={{
            background: 'rgba(139,0,0,0.25)',
            color: '#ff6b6b',
            border: '1px solid rgba(139,0,0,0.4)',
            fontFamily: 'Cinzel, serif',
            letterSpacing: '0.04em',
          }}
        >
          Disconnect
        </button>
      </div>

      {gameState.gamePhase === "creation" && (
        <CharacterCreation
          onSubmit={handleCharacterCreation}
          isLoading={gameState.isCreatingCharacter}
        />
      )}

      {gameState.gamePhase === "game" && gameState.character && (
        <>
          <MainGameScreen
            character={gameState.character}
            scene={gameState.currentScene}
            choices={gameState.choices}
            inventory={gameState.inventory}
            isLoading={gameState.isLoading}
            onChoice={handleChoice}
            onCombat={handleCombat}
            onSave={initiateSave}
            isSaving={isSaving}
            saveStatus={saveStatus}
            pendingUploadCount={pendingUploadCount}
            onConfirmSave={() => doSave(true)}
            onSkipUpload={() => doSave(false)}
            onViewStoryHistory={() => setIsStoryHistoryOpen(true)}
            onViewGallery={() => setIsGalleryOpen(true)}
          />

          <StoryHistory
            storyHistory={gameState.storyHistory}
            isOpen={isStoryHistoryOpen}
            onClose={() => setIsStoryHistoryOpen(false)}
            characterName={gameState.character.name}
          />

          <GalleryModal
            isOpen={isGalleryOpen}
            onClose={() => setIsGalleryOpen(false)}
            character={gameState.character}
            storyHistory={gameState.storyHistory}
            inventory={gameState.inventory}
          />
        </>
      )}
    </div>
  );
}