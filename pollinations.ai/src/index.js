import { createTheme, ThemeProvider } from "@mui/material";
import CssBaseline from "@mui/material/CssBaseline";
import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import { BrowserRouter } from "react-router-dom";
import { startReportingRuntimeErrors } from "react-error-overlay";

import "./index.css";
import ScrollToTop from "./utils/ScrollToTop";

const theme = createTheme();

ReactDOM.render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <BrowserRouter>
      <ScrollToTop>
        <App />
      </ScrollToTop>
    </BrowserRouter>
  </ThemeProvider>,
  document.getElementById("root")
);

startReportingRuntimeErrors({
  onError: (error) => {
    // Custom error handling logic if needed
  },
});