// ImageEditor.js
import React, { useState, memo } from "react"
import {
  Box,
  Paper,
  Grid,
  Typography,
  Menu,
  MenuItem,
  TextField,
  Checkbox,
  IconButton,
  Button,
  Link,
  useMediaQuery,
} from "@material-ui/core"
import InfoIcon from "@material-ui/icons/Info"
import { Colors, MOBILE_BREAKPOINT } from "../../../styles/global"
import { CustomTooltip } from "../../../components/CustomTooltip"
import discordLogo from "../../../assets/icons/discord.png"

export const ImageEditor = memo(function ImageEditor({
  image,
  handleParamChange,
  handleFocus,
  isLoading,
  setIsInputChanged,
}) {
  const { width, height, seed, enhance, nologo, model, prompt } = image
  const [anchorEl, setAnchorEl] = useState(null)
  const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT})`)

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget)
  }

  const handleMenuClose = (value) => {
    setAnchorEl(null)
    if (value) {
      handleInputChange("model", value)
    }
  }

  const handleInputChange = (param, value) => {
    if (image[param] !== value) {
      setIsInputChanged(true)
    }
    handleParamChange(param, value)
  }

  const isEnhanceChecked = enhance !== false

  if (!image.imageURL) {
    return (
      <Typography variant="body2" color="textSecondary">
        Loading...
      </Typography>
    )
  }

  return (
    <Box
      component={Paper}
      style={{
        border: "none",
        boxShadow: "none",
        backgroundColor: "transparent",
      }}
    >
      <Grid container spacing={2}>
        {/* Model, Width, Height */}
        <Grid container item xs={12} spacing={2}>
          <Grid item xs={4}>
            <Typography variant="body2" color="textSecondary">
              Model
            </Typography>
            <Button
              variant="outlined"
              aria-controls="model-menu"
              aria-haspopup="true"
              onClick={handleMenuOpen}
              onFocus={handleFocus}
              style={{
                color: Colors.white,
                width: "100%",
                justifyContent: "flex-start",
                height: "56px",
                fontSize: isMobile ? "1.5rem" : "1.1rem",
              }}
            >
              {model || "flux"}
            </Button>
            <Menu
              id="model-menu"
              anchorEl={anchorEl}
              keepMounted
              open={Boolean(anchorEl)}
              onClose={() => handleMenuClose(null)}
              MenuListProps={{ style: { textAlign: "left", backgroundColor: "black" } }}
            >
              <MenuItem onClick={() => handleMenuClose("flux")}>Flux</MenuItem>
              <MenuItem onClick={() => handleMenuClose("flux-pro")}>Flux-Pro</MenuItem>
              <MenuItem onClick={() => handleMenuClose("flux-realism")}>Flux-Realism</MenuItem>
              <MenuItem onClick={() => handleMenuClose("flux-anime")}>Flux-Anime</MenuItem>
              <MenuItem onClick={() => handleMenuClose("flux-3d")}>Flux-3D</MenuItem>
              <MenuItem onClick={() => handleMenuClose("flux-cablyai")}>Flux-CablyAI</MenuItem>
              <MenuItem onClick={() => handleMenuClose("turbo")}>Turbo</MenuItem>
            </Menu>
          </Grid>
          <Grid item xs={4}>
            <Typography variant="body2" color="textSecondary">
              Width
            </Typography>
            <TextField
              variant="outlined"
              value={width}
              onChange={(e) => handleInputChange("width", parseInt(e.target.value))}
              onFocus={handleFocus}
              type="number"
              InputProps={{
                style: { color: Colors.white, fontSize: isMobile ? "1.5rem" : "1.1rem" },
              }}
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
              onChange={(e) => handleInputChange("height", parseInt(e.target.value))}
              onFocus={handleFocus}
              type="number"
              InputProps={{
                style: { color: Colors.white, fontSize: isMobile ? "1.5rem" : "1.1rem" },
              }}
              style={{ width: "100%" }}
            />
          </Grid>
        </Grid>

        {/* Seed, Enhance, No Logo */}
        <Grid container item xs={12} spacing={2}>
          <Grid item xs={4}>
            <Typography variant="body2" color="textSecondary">
              Seed
            </Typography>
            <TextField
              fullWidth
              variant="outlined"
              value={seed}
              onChange={(e) => handleInputChange("seed", parseInt(e.target.value))}
              onFocus={handleFocus}
              type="number"
              InputProps={{
                style: { color: Colors.white, fontSize: isMobile ? "1.5rem" : "1.1rem" },
              }}
            />
          </Grid>
          <Grid item xs={4}>
            <Typography variant="body2" color="textSecondary">
              Enhance
              <CustomTooltip
                title="AI prompt enhancer that helps create better images by improving your text prompt."
                style={{ color: Colors.lime }}
              >
                <IconButton size="small">
                  <InfoIcon fontSize="small" />
                </IconButton>
              </CustomTooltip>
            </Typography>
            <Checkbox
              checked={isEnhanceChecked}
              onChange={(e) => handleInputChange("enhance", e.target.checked)}
              onFocus={handleFocus}
              style={{ fontSize: isMobile ? "1.5rem" : "1.1rem" }}
            />
          </Grid>
          <Grid item xs={4}>
            <Typography variant="body2" color="textSecondary">
              No Logo
              <CustomTooltip
                title={
                  <span>
                    Disable watermark logo.
                  </span>
                }
                interactive
                style={{ color: Colors.lime }}
              >
                <IconButton size="small">
                  <InfoIcon fontSize="small" />
                </IconButton>
              </CustomTooltip>
            </Typography>
            <Checkbox
              checked={nologo}
              onChange={(e) => handleInputChange("nologo", e.target.checked)}
              onFocus={handleFocus}
              style={{ fontSize: isMobile ? "1.5rem" : "1.1rem" }}
            />
          </Grid>
        </Grid>
      </Grid>
    </Box>
  )
})
