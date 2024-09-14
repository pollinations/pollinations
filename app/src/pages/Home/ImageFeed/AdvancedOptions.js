import React, { useState } from "react"
import {
  Grid,
  Typography,
  Menu,
  MenuItem,
  TextField,
  Checkbox,
  Tooltip,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextareaAutosize,
  Button,
  Link,
} from "@material-ui/core"
import InfoIcon from "@material-ui/icons/Info"
import ExpandMoreIcon from "@material-ui/icons/ExpandMore"
import { Colors } from "../../../styles/global"

export function AdvancedOptions({ image, handleParamChange, handleFocus, isLoading }) {
  const { width, height, seed, nofeed, nologo, model, prompt } = image
  const [anchorEl, setAnchorEl] = useState(null)

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget)
  }

  const handleMenuClose = (value) => {
    setAnchorEl(null)
    if (value) {
      handleParamChange("model", value)
    }
  }

  const handleInputChange = (field, value) => {
    handleParamChange(field, value)
  }

  return (
    <Accordion style={{ backgroundColor: "transparent", color: Colors.white, width: "100%" }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon style={{ color: Colors.lime }} />}>
        <Typography>Advanced Options</Typography>
      </AccordionSummary>
      <AccordionDetails style={{ width: "100%" }}>
        <Grid container spacing={2}>
          {/* Prompt */}
          <Grid item xs={12}>
            <Typography variant="body2" color="textSecondary">
              Prompt
            </Typography>
            <TextareaAutosize
              minRows={3}
              style={{
                width: "100%",
                backgroundColor: "transparent",
                color: Colors.white,
                padding: "10px",
                fontSize: "1.1rem",
              }}
              value={prompt}
              onChange={(e) => handleInputChange("prompt", e.target.value)}
              onFocus={handleFocus}
              disabled={isLoading}
            />
          </Grid>

          {/* Model, Width, Height */}
          <Grid container item xs={12} spacing={2}>
            <Grid item xs={4}>
              <Typography variant="body2" color="textSecondary">
                Model
              </Typography>
              <Button
                aria-controls="model-menu"
                aria-haspopup="true"
                onClick={handleMenuOpen}
                onFocus={handleFocus}
                disabled={isLoading}
                style={{ color: Colors.white, width: "100%" }}
              >
                {model || "flux"}
              </Button>
              <Menu
                id="model-menu"
                anchorEl={anchorEl}
                keepMounted
                open={Boolean(anchorEl)}
                onClose={() => handleMenuClose(null)}
                MenuProps={{
                  PaperProps: {
                    style: {
                      backgroundColor: "red",
                      color: Colors.white,
                    },
                  },
                }}
              >
                <MenuItem onClick={() => handleMenuClose("turbo")}>Turbo</MenuItem>
                <MenuItem onClick={() => handleMenuClose("flux")}>Flux</MenuItem>
                <MenuItem onClick={() => handleMenuClose("flux-realism")}>Flux-Realism</MenuItem>
                <MenuItem onClick={() => handleMenuClose("flux-anime")}>Flux-Anime</MenuItem>
                <MenuItem onClick={() => handleMenuClose("flux-3d")}>Flux-3D</MenuItem>
              </Menu>
            </Grid>
            <Grid item xs={4}>
              <Typography variant="body2" color="textSecondary">
                Width
              </Typography>
              <TextField
                variant="outlined"
                value={width}
                onChange={(e) => handleParamChange("width", parseInt(e.target.value))}
                onFocus={handleFocus}
                type="number"
                InputProps={{
                  style: { color: Colors.white },
                }}
                disabled={isLoading}
                style={{ width: "100%" }}
              />
            </Grid>
            <Grid item xs={4}>
              <Typography variant="body2" color="textSecondary">
                Height
              </Typography>
              <TextField
                variant="outlined"
                value={height}
                onChange={(e) => handleParamChange("height", parseInt(e.target.value))}
                onFocus={handleFocus}
                type="number"
                InputProps={{
                  style: { color: Colors.white },
                }}
                disabled={isLoading}
                style={{ width: "100%" }}
              />
            </Grid>
          </Grid>

          {/* Seed, Private, No Logo */}
          <Grid container item xs={12} spacing={2}>
            <Grid item xs={4}>
              <Typography variant="body2" color="textSecondary">
                Seed
              </Typography>
              <TextField
                fullWidth
                variant="outlined"
                value={seed}
                onChange={(e) => handleParamChange("seed", parseInt(e.target.value))}
                onFocus={handleFocus}
                type="number"
                InputProps={{
                  style: { color: Colors.white },
                }}
                disabled={isLoading}
              />
            </Grid>
            <Grid item xs={4}>
              <Typography variant="body2" color="textSecondary">
                Private
                <Tooltip
                  title="Activating 'private' prevents images from appearing in the feed."
                  style={{ color: Colors.lime }}
                >
                  <IconButton size="small">
                    <InfoIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Typography>
              <Checkbox
                checked={nofeed}
                onChange={(e) => handleParamChange("nofeed", e.target.checked)}
                onFocus={handleFocus}
                disabled={isLoading}
              />
            </Grid>
            <Grid item xs={4}>
              <Typography variant="body2" color="textSecondary">
                No Logo
                <Tooltip
                  title={
                    <span>
                      Hide the pollinations.ai logo. Get the password in Pollinations' Discord
                      community.{" "}
                      <Link
                        href="https://discord.gg/k9F7SyTgqn"
                        target="_blank"
                        style={{ color: Colors.lime }}
                      >
                        Join here
                      </Link>
                    </span>
                  }
                  interactive
                  style={{ color: Colors.lime }}
                >
                  <IconButton size="small">
                    <InfoIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Typography>
              <Checkbox
                checked={nologo}
                onChange={(e) => handleParamChange("nologo", e.target.checked)}
                onFocus={handleFocus}
                disabled={isLoading}
              />
            </Grid>
          </Grid>
        </Grid>
      </AccordionDetails>
    </Accordion>
  )
}
