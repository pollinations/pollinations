import { createTheme, ThemeProvider } from "@mui/material"
import CssBaseline from "@mui/material/CssBaseline"
import React from "react"
import { createRoot } from "react-dom/client" // Import createRoot
import App from "./App"
import { BrowserRouter } from "react-router-dom"
import ScrollToTop from "./utils/ScrollToTop"

const theme = createTheme()
const container = document.getElementById("root")
const root = createRoot(container) // Create a root

root.render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ScrollToTop>
        <App />
      </ScrollToTop>
    </BrowserRouter>
  </ThemeProvider>
)
