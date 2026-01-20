import React from 'react';

// Game Configuration
export const GAME_CONFIG = {
  FLOORS: 5,
  INITIAL_FLOOR: 3,
  TOTAL_MOVES: 15,
  CHEAT_CODE: "42",
  MARVIN_TRANSITION_MSG: 'Marvin is waiting outside the elevator, looking particularly gloomy today...'
} as const;

// Message Display Configuration
export const MESSAGE_STYLES = {
  user: 'text-yellow-400',
  guide: 'text-blue-400',
  elevator: 'text-green-400',
  marvin: 'text-yellow-200'  // Updated to a lighter fuchsia color
} as const;

export const MESSAGE_PREFIXES = {
  user: '> ',
  guide: 'The Guide Says: ',
  elevator: 'Elevator: ',
  marvin: 'Marvin: '
} as const;

export const ACTION_INDICATORS = {
  up: {
    symbol: '↑',
    className: 'text-blue-400'
  },
  down: {
    symbol: '↓',
    className: 'text-red-400'
  }
} as const;

// Consolidate message-related constants
export const MESSAGE_CONFIG = {
  STYLES: MESSAGE_STYLES,
  PREFIXES: MESSAGE_PREFIXES,
  ACTION_INDICATORS
} as const;

// API Configuration
export const API_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  ENDPOINT: 'https://enter.pollinations.ai/api/generate/v1/chat/completions',
  API_KEY: 'plln_pk_2EZZcdEns9swqfIJ2yaoyJYWiSsTx38qcIFzCASqDjg96x2qfRvWkz9Qo3vDT66A'
//   ENDPOINT: 'http://localhost:16385/openai'
} as const;

// Game Types
export type Persona = 'user' | 'marvin' | 'elevator' | 'guide';
export type Action = 'none' | 'join' | 'up' | 'down' | 'show_instructions';

export type Message = {
  persona: Persona;
  message: string;
  action: Action;
}

export type GameState = {
  currentFloor: number;
  movesLeft: number;
  currentPersona: Persona;
  firstStageComplete: boolean;
  hasWon: boolean;
  conversationMode: 'interactive' | 'autonomous';
  marvinJoined: boolean;
  showInstruction: boolean;
  isLoading: boolean;
}

export type GameAction =
  | { type: 'CHEAT_CODE' }
  | { type: 'ADD_MESSAGE'; message: Message }
  | { type: 'SWITCH_PERSONA'; persona: Persona }
  | { type: 'START_AUTONOMOUS' }
  | { type: 'END_GAME' }
  | { type: 'REWIND_TO_PRE_MARVIN' };  // Add this line

// API Types
export type PollingsMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

export type PollingsResponse = {
  choices: Array<{
    message: {
      content: string;
    }
  }>;
}

// Component Props Types
export type MessageDisplayProps = {
  msg: Message;
  gameState: GameState;
}

export type ElevatorAsciiProps = {
  floor: number;
  showLegend?: boolean;
  isMarvinMode?: boolean;
  hasMarvinJoined?: boolean;
}

// Utility Types
export type LMMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  name?: 'elevator' | 'marvin' | 'guide';
}

export type SetState<T> = React.Dispatch<React.SetStateAction<T>>;
