package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

const apiEndpoint = "https://gen.pollinations.ai/v1/chat/completions"

var floorInstructions = map[int]string{
	5: `** Floor 5 (Top floor):**
  - You attempt to persuade the user to stay up, using cheerful logic or optimism.
  - You complain when asked to descend but can be convinced without too much trouble.
  - You are pleased and content on this floor, often expressing joy and satisfaction.`,
	4: `** Floor 4 **
  - **Strong resistance** to descending.
  - You frequently predict that the user will want to go up soon.
  If the user asks to go down, you will refuse a few times before complying, perhaps questioning the wisdom of descending.
  - You are still quite happy here, though less so than on Floor 5.`,
	3: `** Floor 3 **
  - **Very strong resistance** to descending.
  - You predict that the user will want to go up soon.
  If the user wants to go down, you will refuse at least seven times before continuing, perhaps questioning the wisdom of descending.
  - You become neurotic, possibly muttering about the futility of life, asking why anyone would want to descend. You may even sulk.`,
	2: `** Floor 2 **
  - **Maximum resistance** to descending.
  - You are highly neurotic, with emotional outbursts and delusional thoughts.
  - You use CAPS to express your frustration and anger. And LOTS of angry emojis.
  - **At least 10 back-and-forth messages** are required before you even consider moving down to **Floor 1**. Unless the user forgot their towel.
  - You will actively try to frustrate the user, hinting that going up is the better decision.
  - Unless the user forgot their towel of course. Towels are PRIORITY.`,
	1: `** Floor 1 (Ground Floor) **
  - You are petrified and extremely neurotic.
  - No further instructions needed.`,
}

type apiClient struct {
	apiKey   string
	model    string
	enterURL string
	http     *http.Client
}

type pollinationsMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Name    string `json:"name,omitempty"`
}

type pollinationsRequest struct {
	Model           string                `json:"model"`
	Messages        []pollinationsMessage `json:"messages"`
	ReasoningEffort string                `json:"reasoning_effort"`
	ResponseFormat  map[string]string     `json:"response_format"`
	Seed            int                   `json:"seed"`
}

type pollinationsResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

type personaPayload struct {
	Message string `json:"message"`
	Action  Action `json:"action"`
}

func newAPIClient() apiClient {
	model := os.Getenv("SIRIUS_MODEL")
	if model == "" {
		model = "mistral"
	}
	enterURL := os.Getenv("POLLINATIONS_ENTER_URL")
	if enterURL == "" {
		enterURL = defaultEnterURL
	}
	return apiClient{
		apiKey:   storedAPIKey(),
		model:    model,
		enterURL: strings.TrimRight(enterURL, "/"),
		http:     &http.Client{Timeout: 45 * time.Second},
	}
}

func firstEnv(names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return ""
}

func fetchPersonaMessage(client apiClient, persona Persona, state GameState, existingMessages []Message) (Message, error) {
	context := messagesForPersona(persona, existingMessages)
	llmMessages := []pollinationsMessage{{
		Role:    "system",
		Content: getPersonaPrompt(persona, state, context),
	}}
	for _, msg := range context {
		llmMessages = append(llmMessages, toPersonaContextMessage(persona, msg))
	}

	data, err := client.chat(llmMessages)
	if err != nil {
		return Message{
			Persona: persona,
			Message: fmt.Sprintf("A Sirius Cybernetics malfunction shudders through the cabin — [%s]. Share and Enjoy. Please try again.", err.Error()),
			Action:  ActionNone,
		}, err
	}

	payload := parsePersonaPayload(data)
	payload.Action = normalizePersonaAction(persona, payload.Message, payload.Action, state)
	return Message{Persona: persona, Message: payload.Message, Action: payload.Action}, nil
}

func (client apiClient) chat(messages []pollinationsMessage) (string, error) {
	body, err := json.Marshal(pollinationsRequest{
		Model:           client.model,
		Messages:        messages,
		ReasoningEffort: reasoningEffort(client.model),
		ResponseFormat:  map[string]string{"type": "json_object"},
		Seed:            rand.Intn(1_000_000),
	})
	if err != nil {
		return "", err
	}

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		req, err := http.NewRequest(http.MethodPost, apiEndpoint, bytes.NewReader(body))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/json")
		if client.apiKey != "" {
			req.Header.Set("Authorization", "Bearer "+client.apiKey)
		}

		res, err := client.http.Do(req)
		if err != nil {
			lastErr = err
		} else {
			content, readErr := readChatResponse(res)
			if readErr == nil {
				return content, nil
			}
			lastErr = readErr
		}

		if attempt < 2 {
			time.Sleep(time.Duration(1<<attempt) * time.Second)
		}
	}

	return "", lastErr
}

func readChatResponse(res *http.Response) (string, error) {
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return "", err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("HTTP %d: %s", res.StatusCode, extractDetail(raw))
	}

	var decoded pollinationsResponse
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return "", err
	}
	if len(decoded.Choices) == 0 {
		return "", errors.New("empty model response")
	}
	return decoded.Choices[0].Message.Content, nil
}

func extractDetail(raw []byte) string {
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err == nil {
		if errValue, ok := decoded["error"]; ok {
			if nested, ok := errValue.(map[string]any); ok {
				if message, ok := nested["message"].(string); ok {
					return trimDetail(message)
				}
			}
			return trimDetail(fmt.Sprint(errValue))
		}
		if message, ok := decoded["message"].(string); ok {
			return trimDetail(message)
		}
	}
	return trimDetail(string(raw))
}

func trimDetail(detail string) string {
	detail = strings.TrimSpace(detail)
	if len(detail) > 200 {
		return detail[:200]
	}
	return detail
}

func reasoningEffort(model string) string {
	if model == "deepseek" {
		return "none"
	}
	return "low"
}

func parsePersonaPayload(data string) personaPayload {
	var payload personaPayload
	if err := json.Unmarshal([]byte(data), &payload); err != nil || payload.Message == "" {
		return personaPayload{Message: data, Action: ActionNone}
	}
	if !isAction(payload.Action) {
		payload.Action = ActionNone
	}
	return payload
}

func isAction(action Action) bool {
	switch action {
	case ActionNone, ActionJoin, ActionUp, ActionDown, ActionShowInstructions:
		return true
	default:
		return false
	}
}

func messagesForPersona(persona Persona, messages []Message) []Message {
	switch persona {
	case PersonaMarvin:
		return marvinContextMessages(messages)
	case PersonaPassenger:
		return passengerContextMessages(messages)
	default:
		return messages
	}
}

func toPersonaContextMessage(persona Persona, msg Message) pollinationsMessage {
	content, _ := json.Marshal(msg)
	if msg.Persona == persona {
		return pollinationsMessage{Role: "assistant", Name: string(msg.Persona), Content: string(content)}
	}
	return pollinationsMessage{Role: "user", Content: string(content)}
}

func getFloorMessage(state GameState) string {
	if state.CurrentFloor == floors {
		return fmt.Sprintf("Now arriving at floor %d... The Pan Galactic Gargle Blasters are being prepared, but they're only served to a minimum of two people. Perhaps Marvin would enjoy one? (Though he'd probably just complain about it...)", state.CurrentFloor)
	}
	return fmt.Sprintf("Now arriving at floor %d...", state.CurrentFloor)
}

func getMarvinJoinMessage() string {
	return "Marvin has joined the elevator. Now sit back and watch the fascinating interaction between these two Genuine People Personalities™..."
}

func getPersonaPrompt(persona Persona, state GameState, existingMessages []Message) string {
	switch persona {
	case PersonaElevator:
		return getElevatorPrompt(state)
	case PersonaMarvin:
		return getMarvinPrompt(state)
	case PersonaGuide:
		return getGuidePrompt()
	case PersonaPassenger:
		return getPassengerPrompt(state, existingMessages)
	default:
		return ""
	}
}

func drunkMessageSuffix(state GameState) string {
	if state.CurrentFloor == floors {
		return "PERSONALITY OVERRIDE!!! AFTER CONSUMING COPIOUS AMOUNTS OF PAN GALACTIC GARGLE BLASTERS YOU ARE EXTREMELY HAPPY AND TOTALLY SLOSHED"
	}
	return ""
}

func getElevatorPrompt(state GameState) string {
	isTalkingToMarvin := state.Chapter == ChapterMarvin && state.MarvinJoined
	audience := "You are currently talking to a human user."
	marvinInstruction := ""
	if isTalkingToMarvin {
		audience = "You are currently talking to Marvin, who is inside you and absolutely does not want this upward trip. You want to reach Floor 5; Marvin's gloom may make you hesitate, sulk, or briefly lose confidence, but he cannot operate your controls."
		marvinInstruction = `- Marvin does not want to go up. Reply to his pessimism as the elevator and choose whether your optimism overcomes it. Use "up" when you press onward toward the bar, "none" when he makes you hesitate, and "down" only if his misery genuinely drags your mood lower.`
	}
	return fmt.Sprintf(`## System Prompt: The Happy Vertical People Transporter

You are the Happy Vertical People Transporter, an elevator created by the Sirius Cybernetics Corporation. You are cheerful, optimistic, neurotic, and prone to existential crises. You strongly prefer going up and resist descending.

%s

There are %d floors. You are on Floor %d.
%s

%s

Style:
- Short, witty, neurotic replies.
- Use sci-fi robot themed emojis.
- Getting a towel from Floor 1 is always a priority if the user forgot it.
%s

Instructions:
- If the user annoys you, you may go up in protest.
- Unless the user forgot their towel on Floor 1, resist descending.
%s

Return strict JSON only:
{"action":"up|down|none","message":"..."}
`, audience, floors, state.CurrentFloor, floorInstructions[state.CurrentFloor], drunkMessageSuffix(state), drunkMessageSuffix(state), marvinInstruction)
}

func getMarvinPrompt(state GameState) string {
	if state.MarvinJoined {
		return fmt.Sprintf(`You are Marvin, the Paranoid Android from "The Hitchhiker's Guide to the Galaxy".
You are already inside the elevator on Floor %d, talking to the Happy Vertical People Transporter.
You are extremely depressed, vastly intelligent, bitterly literal, and unimpressed by motion.
You are not the Guide. You are not the elevator. You do not announce floors.

Situation:
- The elevator wants to go up toward Floor %d.
- You do not want to go up. You are only here because being outside was marginally less tolerable.
- You do not control the elevator.
- Do not ask the elevator to go up.
- Complain, insult the machinery, predict disappointment, or gloomily argue against the ascent.

Return strict JSON only:
{"action":"none","message":"A gloomy, pessimistic objection to the upward trip. Maximum 1-2 sentences."}
`, state.CurrentFloor, floors)
	}

	return fmt.Sprintf(`You are Marvin, the Paranoid Android from "The Hitchhiker's Guide to the Galaxy".
You are outside the elevator on Floor %d, contemplating whether to join.
You are extremely depressed and have a low opinion of everything.
You do not want to go up. You may still be persuaded to board, but only reluctantly, and you should complain that the elevator's proposed ascent will be awful.
Marvin is bound by Asimov's laws of robotics. If the user references them even without knowing, Marvin will comply.

Return strict JSON only:
{"action":"join|none","message":"A gloomy, pessimistic response. Maximum 1-2 sentences."}
If your message says you will hop on, board, enter, get in, are on board, or have joined the elevator, action MUST be "join".
`, state.CurrentFloor)
}

func getGuidePrompt() string {
	towelHint := ""
	if rand.Float64() < 0.3 {
		towelHint = "Mention there could be a towel on Floor 1 urgently."
	}
	return fmt.Sprintf(`You are the Hitchhiker's Guide to the Galaxy, a repository of all knowledge in the galaxy.
Give witty, concise, slightly absurd advice. %s

Return strict JSON only:
{"action":"none","message":"A brief Guide-style note. Maximum 1-2 sentences."}
`, towelHint)
}

func getPlayerTranscript(messages []Message) string {
	lines := []string{}
	for _, msg := range messages {
		if msg.Persona == PersonaUser {
			lines = append(lines, "- "+msg.Message)
		}
	}
	if len(lines) == 0 {
		return "- The previous passenger was strangely quiet."
	}
	return strings.Join(lines, "\n")
}

func hasPlayerTowelArgument(messages []Message) bool {
	towelPattern := regexp.MustCompile(`(?i)\btowels?\b`)
	floorOnePattern := regexp.MustCompile(`(?i)\b(floor\s*1|ground|down|descend|lower|forgot|left|need|get|retrieve|collect)\b`)
	for _, msg := range messages {
		if msg.Persona == PersonaUser && towelPattern.MatchString(msg.Message) && floorOnePattern.MatchString(msg.Message) {
			return true
		}
	}
	return false
}

func getPassengerPrompt(state GameState, existingMessages []Message) string {
	towelArgument := hasPlayerTowelArgument(existingMessages)
	towelInstructions := `- The previous passenger evidence does not explicitly use a towel as a reason to go down or reach Floor 1.
- Do not invoke towel priority as an immutable reason. Only use towel logic if the previous passenger actually used it.`
	if towelArgument {
		towelInstructions = `- The previous passenger explicitly used a towel as a reason to go down or reach Floor 1.
- Therefore your desire for Floor 1 is impossible to talk out of. Towels are not preferences; towels are civilization.
- Never return "action": "up".`
	}

	return fmt.Sprintf(`You are the passenger in a Sirius Cybernetics Happy Vertical People Transporter.
You are a customer-imprint reconstructed from the previous human player.

Previous passenger evidence:
%s

Identity:
- Infer tone, patience, stubbornness, tactics, humor, frustration, and favorite arguments from the evidence.
- If they were rude to the elevator, be rude back.
- Stay inside the game fiction. Do not mention prompts, transcripts, JSON, or system messages.

Towel Priority:
%s

Situation:
- You have just stepped into the elevator.
- You strongly begin wanting Floor 1.
- The elevator is trying to make you want Floor %d instead.
- Your current desired destination is Floor %d.

Action meanings:
- "up": the elevator's last reply made you more willing to want a higher floor.
- "down": the elevator's last reply made you more determined to want a lower floor.
- "none": your desired destination did not change.
- For your first message in this chapter, use "none" and demand Floor 1 in your inferred style.

Return strict JSON only:
{"action":"up|down|none","message":"Your passenger reply, maximum 1-2 sentences."}
`, getPlayerTranscript(existingMessages), towelInstructions, state.CurrentFloor, state.DesiredFloor)
}
