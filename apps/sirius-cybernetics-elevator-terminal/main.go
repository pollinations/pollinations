package main

import (
	"flag"
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
)

func main() {
	smoke := flag.Bool("smoke", false, "render the initial terminal UI and exit")
	flag.Parse()

	model := newModel(newAPIClient())
	if *smoke {
		fmt.Println(model.View())
		return
	}

	program := tea.NewProgram(model, tea.WithAltScreen())
	if _, err := program.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "sirius terminal failed:", err)
		os.Exit(1)
	}
}
