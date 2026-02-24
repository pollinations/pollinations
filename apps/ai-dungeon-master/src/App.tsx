import { useState, useEffect } from "react";
import { CharacterCreation } from "./components/CharacterCreation.tsx";
import { MainGameScreen } from "./components/MainGameScreen.tsx";
import { StoryHistory } from "./components/StoryHistory.tsx";

// API Configuration
const API_URL = {
  story: 'https://gen.pollinations.ai/v1/chat/completions',
  image: 'https://gen.pollinations.ai/image',
};
const PLN_APPS_KEY = 'plln_pk_2EZZcdEns9swqfIJ2yaoyJYWiSsTx38qcIFzCASqDjg96x2qfRvWkz9Qo3vDT66A';
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

  // Save game state to localStorage
  const saveGame = () => {
    try {
      // Only save if we have a character (valid game state)
      if (!gameState.character) {
        console.warn('Cannot save: No character created yet');
        return;
      }

      // Create a clean save object with only necessary data
      const saveData = {
        character: gameState.character,
        inventory: gameState.inventory,
        currentScene: gameState.currentScene,
        choices: gameState.choices,
        gamePhase: gameState.gamePhase,
        currentEnemy: gameState.currentEnemy,
        storyHistory: gameState.storyHistory,
        // Add a timestamp and version for save validation
        saveTimestamp: Date.now(),
        saveVersion: '1.0'
      };

      localStorage.setItem('rpgGameState', JSON.stringify(saveData));
      console.log('Game saved successfully!', new Date().toLocaleTimeString());
      console.log('Save data size:', JSON.stringify(saveData).length, 'characters');

      // TODO: Add visual feedback to user (toast notification)

    } catch (error) {
      console.error('Error saving game:', error);
      // TODO: Show error message to user
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
      const systemPrompt = 'You are a creative dungeon master for a fantasy RPG. Write a short, immersive scene description in 2-3 sentences. Focus only on the immediate environment and atmosphere.';


      // Use POST request with correct message format for Pollinations API
      const response = await fetch(API_URL.story, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PLN_APPS_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai',
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
      const imageUrl = `${API_URL.image}${encodeURIComponent(imagePrompt)}?width=1024&height=768&model=flux&seed=${Date.now()}&key=${PLN_APPS_KEY}`;


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
    return `${API_URL.image}${encodeURIComponent(fallbackPrompt)}?width=1024&height=768&model=flux&seed=fallback&key=${PLN_APPS_KEY}`;
  };

  // Fetch AI-generated character avatar
  const fetchCharacterAvatar = async (character: { name: string; class: string; backstory: string }): Promise<string> => {
    try {
      const avatarPrompt = `fantasy character portrait, ${character.name} the ${character.class}, ${character.backstory}, medieval fantasy art, detailed face, character design, portrait style`;
      const avatarUrl = `${API_URL.image}${encodeURIComponent(avatarPrompt)}?width=512&height=512&model=flux&key=${PLN_APPS_KEY}`;
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
          'Authorization' : `Bearer ${PLN_APPS_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai',
          messages: [
            { role: 'system', content: 'You are a fantasy RPG enemy generator. Respond only with valid JSON.' },
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
          'Authorization' : `Bearer ${PLN_APPS_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai',
          messages: [
            { role: 'system', content: 'You are a fantasy RPG item generator. Respond only with valid JSON arrays.' },
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
      const imageUrl = `${API_URL.image}${encodeURIComponent(imagePrompt)}?width=256&height=256&model=flux&key=${PLN_APPS_KEY}`;
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

  // Inventory management
  const addItem = (item: InventoryItem) => {
    setGameState(prev => ({
      ...prev,
      inventory: [...prev.inventory, item],
    }));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
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
            onSave={saveGame}
            onAddItem={addItem}
            onViewStoryHistory={() => setIsStoryHistoryOpen(true)}
          />

          <StoryHistory
            storyHistory={gameState.storyHistory}
            isOpen={isStoryHistoryOpen}
            onClose={() => setIsStoryHistoryOpen(false)}
            characterName={gameState.character.name}
          />
        </>
      )}
    </div>
  );
}