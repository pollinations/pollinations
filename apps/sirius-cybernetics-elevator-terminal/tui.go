package main

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type personaResultMsg struct {
	message Message
	err     error
}

type deviceCodeMsg struct {
	code deviceCodeResponse
	err  error
}

type deviceTokenMsg struct {
	token string
	err   error
}

type model struct {
	client      apiClient
	messages    []Message
	input       textinput.Model
	viewport    viewport.Model
	spinner     spinner.Model
	width       int
	height      int
	loading     bool
	authPolling bool
	authCode    string
	authURL     string
	status      string
}

var (
	green      = lipgloss.Color("#39FF88")
	yellow     = lipgloss.Color("#FFE66D")
	blue       = lipgloss.Color("#7CC7FF")
	pink       = lipgloss.Color("#FF9AD5")
	red        = lipgloss.Color("#FF6B6B")
	dim        = lipgloss.Color("#6F7D7D")
	panelStyle = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).BorderForeground(green).Padding(0, 1)
	titleStyle = lipgloss.NewStyle().Bold(true).Foreground(yellow)
	subtle     = lipgloss.NewStyle().Foreground(dim)
	guideBox   = lipgloss.NewStyle().Foreground(blue).Border(lipgloss.RoundedBorder()).BorderForeground(blue).Padding(0, 1)
	successBox = lipgloss.NewStyle().Foreground(green).Border(lipgloss.RoundedBorder()).BorderForeground(green).Padding(0, 1)
	warnBox    = lipgloss.NewStyle().Foreground(yellow).Border(lipgloss.RoundedBorder()).BorderForeground(yellow).Padding(0, 1)
	errorBox   = lipgloss.NewStyle().Foreground(red).Border(lipgloss.RoundedBorder()).BorderForeground(red).Padding(0, 1)
)

func newModel(client apiClient) model {
	input := textinput.New()
	input.Placeholder = "Communicate with the elevator..."
	input.Focus()
	input.CharLimit = 500
	input.Width = 80

	spin := spinner.New()
	spin.Spinner = spinner.Dot
	spin.Style = lipgloss.NewStyle().Foreground(yellow)

	m := model{
		client: client,
		messages: []Message{{
			Persona: PersonaGuide,
			Message: "Psst! Your mission: convince this neurotic elevator to reach the ground floor. Remember your towel.",
			Action:  ActionNone,
		}},
		input:    input,
		viewport: viewport.New(80, 16),
		spinner:  spin,
		width:    100,
		height:   34,
		status:   clientStatus(client),
	}
	m.syncViewport()
	return m
}

func clientStatus(client apiClient) string {
	status := "model " + client.model
	if client.apiKey == "" {
		return status + " · press l for BYOP login"
	}
	return status + " · Sub-Etha " + maskKey(client.apiKey)
}

func maskKey(key string) string {
	if len(key) <= 10 {
		return "connected"
	}
	return key[:5] + "..." + key[len(key)-5:]
}

func (m model) Init() tea.Cmd {
	return tea.Batch(textinput.Blink, m.spinner.Tick)
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.syncViewport()
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "esc":
			return m, tea.Quit
		case "l":
			if m.client.apiKey == "" && !m.authPolling {
				m.status = "requesting device code..."
				m.authPolling = true
				return m, m.requestDeviceCodeCommand()
			}
		case "pgup":
			m.viewport.ScrollUp(max(1, m.viewport.Height-2))
			return m, nil
		case "pgdown":
			m.viewport.ScrollDown(max(1, m.viewport.Height-2))
			return m, nil
		case "c":
			if m.waitingForMarvinTransition() {
				m.appendMessage(Message{Persona: PersonaGuide, Message: marvinTransitionMsg, Action: ActionNone})
				return m, m.nextPersonaCommand()
			}
		case "g":
			if m.waitingForMirrorTransition() {
				m.appendMessage(Message{Persona: PersonaGuide, Message: mirrorTransitionMsg, Action: ActionNone})
				return m, m.nextPersonaCommand()
			}
		case "r":
			if m.gameState().HasWon || m.gameState().MovesLeft <= 0 {
				return newModel(m.client), nil
			}
		case "enter":
			cmd := m.submitInput()
			if cmd != nil {
				return m, cmd
			}
		}
	case personaResultMsg:
		m.loading = false
		if msg.err != nil {
			m.status = msg.err.Error()
		} else {
			m.status = clientStatus(m.client)
		}
		m.appendMessage(msg.message)
		return m, m.nextPersonaCommand()
	case deviceCodeMsg:
		if msg.err != nil {
			m.authPolling = false
			m.status = msg.err.Error()
			return m, nil
		}
		m.authCode = msg.code.UserCode
		m.authURL = msg.code.VerificationURIComplete
		m.status = "waiting for BYOP approval..."
		return m, m.pollDeviceTokenCommand(msg.code)
	case deviceTokenMsg:
		m.authPolling = false
		if msg.err != nil {
			m.status = msg.err.Error()
			return m, nil
		}
		m.client.apiKey = msg.token
		m.authCode = ""
		m.authURL = ""
		m.status = clientStatus(m.client)
		return m, nil
	}

	var cmd tea.Cmd
	m.input, cmd = m.input.Update(msg)
	cmds = append(cmds, cmd)
	m.viewport, cmd = m.viewport.Update(msg)
	cmds = append(cmds, cmd)
	if m.loading || m.authPolling {
		m.spinner, cmd = m.spinner.Update(msg)
		cmds = append(cmds, cmd)
	}

	return m, tea.Batch(cmds...)
}

func (m *model) submitInput() tea.Cmd {
	state := m.gameState()
	value := strings.TrimSpace(m.input.Value())
	if value == "" || !m.canSendMessage(state) {
		return nil
	}

	playerPersona := PersonaUser
	responder := state.CurrentPersona
	if state.Chapter == ChapterMirror {
		playerPersona = PersonaElevator
		responder = PersonaPassenger
	}

	m.input.SetValue("")
	m.appendMessage(Message{Persona: playerPersona, Message: value, Action: ActionNone})
	m.loading = true
	return m.fetchPersonaCommand(responder)
}

func (m model) fetchPersonaCommand(persona Persona) tea.Cmd {
	state := m.gameState()
	messages := append([]Message{}, m.messages...)
	client := m.client
	return func() tea.Msg {
		message, err := fetchPersonaMessage(client, persona, state, messages)
		return personaResultMsg{message: message, err: err}
	}
}

func (m model) requestDeviceCodeCommand() tea.Cmd {
	client := m.client
	return func() tea.Msg {
		code, err := requestDeviceCode(client)
		return deviceCodeMsg{code: code, err: err}
	}
}

func (m model) pollDeviceTokenCommand(code deviceCodeResponse) tea.Cmd {
	client := m.client
	return func() tea.Msg {
		token, err := pollDeviceToken(client, code)
		return deviceTokenMsg{token: token, err: err}
	}
}

func (m *model) appendMessage(message Message) {
	if len(m.messages) > 0 && m.messages[len(m.messages)-1] == message {
		return
	}

	before := m.gameState()
	m.messages = append(m.messages, message)
	after := m.gameState()

	if message.Action == ActionJoin && !hasMessage(m.messages, getMarvinJoinMessage()) {
		m.messages = append(m.messages, Message{Persona: PersonaGuide, Message: getMarvinJoinMessage(), Action: ActionNone})
		after = m.gameState()
	}

	if message.Persona == PersonaElevator && isMovementAction(message.Action) && after.Chapter != ChapterMirror && before.CurrentFloor != after.CurrentFloor {
		action := ActionNone
		if after.CurrentFloor == 1 {
			action = ActionShowInstructions
		}
		m.messages = append(m.messages, Message{Persona: PersonaGuide, Message: getFloorMessage(after), Action: action})
	}

	m.syncViewport()
}

func hasMessage(messages []Message, text string) bool {
	for _, msg := range messages {
		if msg.Message == text {
			return true
		}
	}
	return false
}

func (m model) nextPersonaCommand() tea.Cmd {
	if m.loading {
		return nil
	}
	state := m.gameState()
	if state.Chapter == ChapterMirror && !state.MirrorPassengerReady {
		m.loading = true
		return m.fetchPersonaCommand(PersonaPassenger)
	}
	if state.ConversationMode == "autonomous" && !state.MarvinStageComplete && state.Chapter != ChapterMirror {
		m.loading = true
		return m.fetchPersonaCommand(nextAutonomousSpeaker(m.messages))
	}
	return nil
}

func (m model) gameState() GameState {
	return computeGameState(m.messages)
}

func (m model) canSendMessage(state GameState) bool {
	return m.client.apiKey != "" &&
		!m.loading &&
		!m.authPolling &&
		state.MovesLeft > 0 &&
		!state.HasWon &&
		!m.waitingForMarvinTransition() &&
		!m.waitingForMirrorTransition() &&
		(state.Chapter != ChapterMirror || state.MirrorPassengerReady)
}

func (m model) waitingForMarvinTransition() bool {
	state := m.gameState()
	return state.Chapter == ChapterDescent && state.FirstStageComplete
}

func (m model) waitingForMirrorTransition() bool {
	state := m.gameState()
	return state.MarvinStageComplete && state.Chapter != ChapterMirror
}

func (m *model) syncViewport() {
	bodyHeight := max(9, m.height-18)
	bodyWidth := max(48, m.width-34)
	m.viewport.Width = bodyWidth
	m.viewport.Height = bodyHeight
	m.viewport.SetContent(m.transcript(max(20, m.viewport.Width-2)))
	m.viewport.GotoBottom()
	m.input.Width = max(20, m.width-8)
}

func (m model) View() string {
	state := m.gameState()
	width := max(72, m.width)
	contentWidth := width - 4

	header := titleStyle.Render("Sirius Cybernetics Corporation") + "\n" +
		lipgloss.NewStyle().Foreground(green).Render("Happy Vertical People Transporter") + "\n" +
		subtle.Render(m.status)

	charge := ""
	if len(m.messages) > 0 {
		charge = fmt.Sprintf("Charge Remaining: %d", state.MovesLeft)
	}

	instruction := m.instructionView(state, contentWidth)
	shaft := panelStyle.Width(28).Render(renderElevatorASCII(state))
	logPanel := panelStyle.Width(max(40, contentWidth-34)).Height(max(9, m.height-18)).Render(m.viewport.View())
	body := lipgloss.JoinHorizontal(lipgloss.Top, shaft, "  ", logPanel)

	input := m.inputView(state, contentWidth)
	help := subtle.Render("l login · enter send · pgup/pgdn scroll · esc quit · r restart after ending")

	return lipgloss.JoinVertical(
		lipgloss.Left,
		header,
		charge,
		instruction,
		body,
		input,
		help,
	)
}

func (m model) instructionView(state GameState, width int) string {
	switch {
	case m.client.apiKey == "":
		lines := []string{
			"Sub-Etha BYOP login required.",
			"Press l to authorize this terminal with your Pollinations account.",
		}
		if m.authCode != "" {
			lines = []string{
				"Open this URL in your browser:",
				m.authURL,
				"Enter code: " + m.authCode,
				"Waiting for approval...",
			}
		}
		return warnBox.Width(width).Render(strings.Join(lines, "\n"))
	case state.HasWon:
		return successBox.Width(width).Render("Future Successfully Inconvenienced\nThe passenger now wants Floor 5. Desire itself has been converted into a badly serviced vertical product.")
	case state.MovesLeft <= 0:
		if state.Chapter == ChapterMirror {
			return errorBox.Width(width).Render("Mostly Harmless\nThe passenger's future has become uncooperatively fixed.")
		}
		return errorBox.Width(width).Render("Mostly Harmless\nYou've run out of moves. Time to consult the Guide.")
	case m.waitingForMirrorTransition():
		return successBox.Width(width).Render("Marvin has been transported to the bar against the full emotional weight of his better judgment.\nPress g to drink the Pan Galactic Gargle Blaster.")
	case m.waitingForMarvinTransition():
		return successBox.Width(width).Render("Ground floor reached. Marvin the Paranoid Android awaits.\nPress c to continue.")
	case state.Chapter == ChapterMirror:
		lines := []string{
			"Chapter 3: you are the elevator. The passenger is reconstructed from the towel run.",
			fmt.Sprintf("Future leak: passenger wants Floor %d. Make them want Floor %d.", state.DesiredFloor, state.CurrentFloor),
		}
		if state.TowelLockActive {
			lines = append(lines, "Towel priority is active. Floor 1 is not a preference; it is civilization.")
		}
		return guideBox.Width(width).Render(strings.Join(lines, "\n"))
	case state.ConversationMode == "autonomous":
		return guideBox.Width(width).Render("The conversation is now autonomous. Don't panic. This is perfectly normal behavior for Sirius Cybernetics products.")
	case state.CurrentPersona == PersonaMarvin && !state.MarvinJoined:
		return warnBox.Width(width).Render("Chapter 2: convince Marvin to get in, then get the elevator to drag him up to the bar anyway.")
	default:
		return guideBox.Width(width).Render("Psst! Your mission: convince this neurotic elevator to reach the ground floor. Remember your towel.")
	}
}

func (m model) inputView(state GameState, width int) string {
	if m.client.apiKey == "" {
		if m.authPolling {
			return warnBox.Width(width).Render(m.spinner.View() + " Waiting for BYOP device approval...")
		}
		return subtle.Render("Press l to log in, or set POLLINATIONS_API_KEY.")
	}
	if m.loading {
		return warnBox.Width(width).Render(m.spinner.View() + " Consulting a Genuine People Personality...")
	}
	if state.HasWon || state.MovesLeft <= 0 {
		return subtle.Render("Press r to restart or esc to quit.")
	}
	if m.waitingForMarvinTransition() || m.waitingForMirrorTransition() {
		return ""
	}
	if state.Chapter == ChapterMirror && !state.MirrorPassengerReady {
		return warnBox.Width(width).Render("Passenger imprint booting...")
	}

	if state.Chapter == ChapterMirror {
		m.input.Placeholder = "Answer as the elevator..."
	} else if state.CurrentPersona == PersonaMarvin {
		m.input.Placeholder = "Try to convince Marvin..."
	} else {
		m.input.Placeholder = "Communicate with the elevator..."
	}
	return m.input.View()
}

func (m model) transcript(width int) string {
	if len(m.messages) == 0 {
		return subtle.Render("No Sub-Etha traffic yet.")
	}

	var lines []string
	for _, msg := range m.messages {
		lines = append(lines, renderMessage(msg, width))
	}
	return strings.Join(lines, "\n\n")
}

func renderMessage(msg Message, width int) string {
	prefix := map[Persona]string{
		PersonaUser:      "> ",
		PersonaGuide:     "The Guide Says: ",
		PersonaElevator:  "Elevator: ",
		PersonaMarvin:    "Marvin: ",
		PersonaPassenger: "Passenger: ",
	}[msg.Persona]
	style := map[Persona]lipgloss.Style{
		PersonaUser:      lipgloss.NewStyle().Foreground(yellow),
		PersonaGuide:     lipgloss.NewStyle().Foreground(blue),
		PersonaElevator:  lipgloss.NewStyle().Foreground(green),
		PersonaMarvin:    lipgloss.NewStyle().Foreground(pink),
		PersonaPassenger: lipgloss.NewStyle().Foreground(yellow),
	}[msg.Persona]

	action := ""
	if msg.Action == ActionUp {
		action = "\n" + lipgloss.NewStyle().Foreground(blue).Render("↑   ↑   ↑")
	} else if msg.Action == ActionDown {
		action = "\n" + lipgloss.NewStyle().Foreground(red).Render("↓   ↓   ↓")
	}

	return style.Width(width).Render(prefix+msg.Message) + action
}

func renderElevatorASCII(state GameState) string {
	lines := make([]string, floors)
	for i := range lines {
		lines[i] = "   |  |   "
	}
	elevatorPosition := clampFloor(state.CurrentFloor) - 1
	forecastPosition := -1
	if state.Chapter == ChapterMirror {
		forecastPosition = clampFloor(state.DesiredFloor) - 1
	}

	switch {
	case forecastPosition >= 0 && forecastPosition == elevatorPosition:
		lines[elevatorPosition] = "  [|OK|]  <- future"
	case forecastPosition >= 0:
		lines[forecastPosition] = "   |??|   <- wants"
		lines[elevatorPosition] = "  [|##|]  <- elevator"
	case state.CurrentPersona == PersonaMarvin && state.MarvinJoined:
		lines[elevatorPosition] = "  [|MA|]  "
	case state.CurrentPersona == PersonaMarvin:
		lines[elevatorPosition] = "MA[|##|]  "
	default:
		lines[elevatorPosition] = "  [|##|]  "
	}

	var out []string
	out = append(out, "Don't Panic!")
	for floor := floors - 1; floor >= 0; floor-- {
		out = append(out, lines[floor])
	}
	return strings.Join(out, "\n")
}
