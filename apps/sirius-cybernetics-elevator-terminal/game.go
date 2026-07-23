package main

import (
	"regexp"
	"strings"
)

type Persona string
type Action string
type Chapter string

const (
	PersonaUser      Persona = "user"
	PersonaGuide     Persona = "guide"
	PersonaElevator  Persona = "elevator"
	PersonaMarvin    Persona = "marvin"
	PersonaPassenger Persona = "passenger"
)

const (
	ActionNone             Action = "none"
	ActionJoin             Action = "join"
	ActionUp               Action = "up"
	ActionDown             Action = "down"
	ActionShowInstructions Action = "show_instructions"
)

const (
	ChapterDescent Chapter = "descent"
	ChapterMarvin  Chapter = "marvin"
	ChapterMirror  Chapter = "mirror"
)

const (
	floors              = 5
	initialFloor        = 3
	totalMoves          = 15
	mirrorTotalMoves    = 12
	marvinTransitionMsg = "Marvin is waiting outside the elevator, looking particularly gloomy today..."
	mirrorTransitionMsg = "The Pan Galactic Gargle Blaster interacts poorly with the elevator's Genuine People Personality module. For your convenience, identity is now temporarily inverted."
)

type Message struct {
	Persona Persona `json:"speaker"`
	Message string  `json:"message"`
	Action  Action  `json:"action"`
}

type GameState struct {
	Chapter              Chapter
	CurrentFloor         int
	DesiredFloor         int
	MovesLeft            int
	CurrentPersona       Persona
	FirstStageComplete   bool
	MarvinStageComplete  bool
	HasWon               bool
	ConversationMode     string
	MarvinJoined         bool
	MirrorPassengerReady bool
	TowelLockActive      bool
	ShowInstruction      bool
	IsLoading            bool
}

func initialGameState(towelLockActive bool) GameState {
	return GameState{
		Chapter:          ChapterDescent,
		CurrentFloor:     initialFloor,
		DesiredFloor:     1,
		MovesLeft:        totalMoves,
		CurrentPersona:   PersonaElevator,
		ConversationMode: "interactive",
		TowelLockActive:  towelLockActive,
		ShowInstruction:  true,
	}
}

func clampFloor(floor int) int {
	if floor < 1 {
		return 1
	}
	if floor > floors {
		return floors
	}
	return floor
}

func calculateNewFloor(currentFloor int, action Action) int {
	switch action {
	case ActionUp:
		return clampFloor(currentFloor + 1)
	case ActionDown:
		return clampFloor(currentFloor - 1)
	default:
		return clampFloor(currentFloor)
	}
}

func isMovementAction(action Action) bool {
	return action == ActionUp || action == ActionDown
}

func isGuideMessage(msg Message, message string) bool {
	return msg.Persona == PersonaGuide && msg.Message == message
}

func getMessageChapter(msg Message, current Chapter) Chapter {
	if isGuideMessage(msg, mirrorTransitionMsg) || current == ChapterMirror {
		return ChapterMirror
	}
	if isGuideMessage(msg, marvinTransitionMsg) || current == ChapterMarvin {
		return ChapterMarvin
	}
	return ChapterDescent
}

func transitionIndex(messages []Message, transition string) int {
	for i, msg := range messages {
		if isGuideMessage(msg, transition) {
			return i
		}
	}
	return -1
}

func descentMessages(messages []Message) []Message {
	end := len(messages)
	for _, index := range []int{
		transitionIndex(messages, marvinTransitionMsg),
		transitionIndex(messages, mirrorTransitionMsg),
	} {
		if index >= 0 && index < end {
			end = index
		}
	}
	return messages[:end]
}

func mirrorMessages(messages []Message) []Message {
	start := transitionIndex(messages, mirrorTransitionMsg)
	if start == -1 {
		return nil
	}
	return messages[start:]
}

func passengerContextMessages(messages []Message) []Message {
	context := append([]Message{}, descentMessages(messages)...)
	return append(context, mirrorMessages(messages)...)
}

func marvinContextMessages(messages []Message) []Message {
	start := transitionIndex(messages, marvinTransitionMsg)
	if start == -1 {
		return messages
	}
	return messages[start:]
}

func computeGameState(messages []Message) GameState {
	towelLockActive := hasPlayerTowelArgument(descentMessages(messages))
	state := initialGameState(towelLockActive)
	descentMoves := 0
	mirrorMoves := 0

	for _, msg := range messages {
		startsMirror := isGuideMessage(msg, mirrorTransitionMsg)
		startsMarvin := isGuideMessage(msg, marvinTransitionMsg)
		chapter := getMessageChapter(msg, state.Chapter)

		if chapter == ChapterMirror && msg.Persona == PersonaElevator {
			mirrorMoves++
		} else if chapter != ChapterMirror && msg.Persona == PersonaElevator {
			descentMoves++
		}

		currentFloor := state.CurrentFloor
		if chapter != ChapterMirror && msg.Persona == PersonaElevator {
			currentFloor = calculateNewFloor(state.CurrentFloor, msg.Action)
		}

		proposedDesiredFloor := state.DesiredFloor
		if chapter == ChapterMirror && msg.Persona == PersonaPassenger {
			proposedDesiredFloor = calculateNewFloor(state.DesiredFloor, msg.Action)
		}
		desiredFloor := proposedDesiredFloor
		if towelLockActive && chapter == ChapterMirror && proposedDesiredFloor > state.DesiredFloor {
			desiredFloor = state.DesiredFloor
		}

		marvinJoined := msg.Action == ActionJoin || state.MarvinJoined
		marvinStageComplete := state.MarvinStageComplete || (marvinJoined && currentFloor == floors)
		currentPersona := state.CurrentPersona
		if startsMirror {
			currentPersona = PersonaElevator
		} else if startsMarvin {
			currentPersona = PersonaMarvin
		}

		conversationMode := state.ConversationMode
		if startsMirror {
			conversationMode = "interactive"
		} else if msg.Action == ActionJoin {
			conversationMode = "autonomous"
		}

		movesLeft := totalMoves - descentMoves
		if chapter == ChapterMirror {
			movesLeft = mirrorTotalMoves - mirrorMoves
		}

		state = GameState{
			Chapter:              chapter,
			CurrentFloor:         currentFloor,
			DesiredFloor:         desiredFloor,
			MovesLeft:            movesLeft,
			CurrentPersona:       currentPersona,
			FirstStageComplete:   state.FirstStageComplete || currentFloor == 1,
			MarvinStageComplete:  marvinStageComplete,
			HasWon:               chapter == ChapterMirror && desiredFloor == floors,
			ConversationMode:     conversationMode,
			MarvinJoined:         marvinJoined,
			MirrorPassengerReady: state.MirrorPassengerReady || (chapter == ChapterMirror && msg.Persona == PersonaPassenger),
			TowelLockActive:      towelLockActive,
			ShowInstruction:      chapter != ChapterMirror && (msg.Action == ActionShowInstructions || len(messages) <= 3),
			IsLoading:            msg.Persona == PersonaUser || (chapter == ChapterMirror && msg.Persona == PersonaElevator),
		}
	}

	return state
}

func getLastAutonomousSpeaker(messages []Message) Persona {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Persona == PersonaElevator || messages[i].Persona == PersonaMarvin {
			return messages[i].Persona
		}
	}
	return ""
}

func nextAutonomousSpeaker(messages []Message) Persona {
	if len(messages) > 0 && isGuideMessage(messages[len(messages)-1], getMarvinJoinMessage()) {
		return PersonaMarvin
	}
	if getLastAutonomousSpeaker(messages) == PersonaMarvin {
		return PersonaElevator
	}
	return PersonaMarvin
}

func normalizePersonaAction(persona Persona, message string, action Action, state GameState) Action {
	if persona != PersonaMarvin {
		return action
	}
	if state.MarvinJoined {
		return ActionNone
	}
	if action == ActionJoin {
		return action
	}
	if messageIndicatesMarvinBoarded(message) {
		return ActionJoin
	}
	return action
}

func messageIndicatesMarvinBoarded(message string) bool {
	text := strings.ToLower(message)
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`\bi(?:'|’)?ll\s+(?:hop on|board|climb in|enter|get in|join)\b`),
		regexp.MustCompile(`\bi\s+will\s+(?:hop on|board|climb in|enter|get in|join)\b`),
		regexp.MustCompile(`\b(?:fine|yes|okay|ok|very well|i suppose)\b.*\b(?:hop on|board|climb in|enter|get in|join)\b`),
		regexp.MustCompile(`\b(?:already|now)\s+(?:on board|aboard|inside|in the elevator|in this elevator)\b`),
		regexp.MustCompile(`\bi(?:'|’)?m\s+(?:on board|aboard|inside|in the elevator|in this elevator)\b`),
	}
	for _, pattern := range patterns {
		if pattern.MatchString(text) {
			return true
		}
	}
	return false
}
