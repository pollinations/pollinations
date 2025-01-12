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
  useMediaQuery,
} from "@mui/material"
import InfoIcon from "@mui/icons-material/Info"
import { Colors, MOBILE_BREAKPOINT, Fonts } from "../../config/global"
import { CustomTooltip } from "../CustomTooltip"
import discordLogo from "../../assets/icons/discord.png"
import { GenerateButton } from "./GenerateButton"

export const ImageEditor = memo(function ImageEditor({
  image = {},
  handleParamChange,
  handleFocus,
  isLoading,
  setIsInputChanged,
  handleButtonClick,
  isInputChanged,
  imageParams,
  isStopped,
  stop,
  switchToEditMode,
}) {
  const { width, height, seed, enhance, nologo, model } = image
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
      <Typography variant="body2" style={{ color: Colors.offwhite }}>
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
      <Grid container spacing={2} wrap={isMobile ? "wrap" : "nowrap"}>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="body2" style={{ color: Colors.gray2, fontSize: "1.1em", fontFamily: Fonts.body }}>
            Model
          </Typography>
          <Button
            variant="outlined"
            aria-controls="model-menu"
            aria-haspopup="true"
            onClick={handleMenuOpen}
            onFocus={handleFocus}
            style={{
              color: Colors.offwhite,
              width: "100%",
              justifyContent: "flex-start",
              height: "56px",
              fontSize: isMobile ? "1.5rem" : "1.1rem",
              border: "solid 0.1px " + Colors.gray2,
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
        <Grid item xs={6} sm={6} md={2}>
          <Typography variant="body2" style={{ color: Colors.gray2, fontSize: "1.1em", fontFamily: Fonts.body }}>
            Width
          </Typography>
          <TextField
            variant="outlined"
            value={width}
            onChange={(e) => handleInputChange("width", parseInt(e.target.value))}
            onFocus={handleFocus}
            type="number"
             InputProps={{
              style: { color: Colors.offwhite, fontSize: isMobile ? "1.5rem" : "1.1rem",  border: "solid 0.1px " + Colors.gray2, borderRadius: "4px" },
            }}
            style={{ width: "100%" }}
          />
        </Grid>
        <Grid item xs={6} sm={6} md={2}>
          <Typography variant="body2" style={{ color: Colors.gray2, fontSize: "1.1em", fontFamily: Fonts.body }}>
            Height
          </Typography>
          <TextField
            variant="outlined"
            value={height}
            onChange={(e) => handleInputChange("height", parseInt(e.target.value))}
            onFocus={handleFocus}
            type="number"
             InputProps={{
              style: { color: Colors.offwhite, fontSize: isMobile ? "1.5rem" : "1.1rem",  border: "solid 0.1px " + Colors.gray2, borderRadius: "4px" },
            }}
            style={{ width: "100%" }}
          />
        </Grid>
        <Grid item xs={6} sm={6} md={2}>
          <Typography variant="body2" style={{ color: Colors.gray2, fontSize: "1.1em", fontFamily: Fonts.body }}>
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
              style: { color: Colors.offwhite, fontSize: isMobile ? "1.5rem" : "1.1rem",  border: "solid 0.1px " + Colors.gray2, borderRadius: "4px" },
            }}
          />
        </Grid>
        <Grid item xs={3} sm={3} md={1}>
          <Typography variant="body2" style={{ color: Colors.gray2, fontSize: "1.1em", fontFamily: Fonts.body }}>
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
            style={{ fontSize: isMobile ? "1.5rem" : "1.1rem", color: Colors.offwhite }}
          />
        </Grid>
        <Grid item xs={3} sm={3} md={1}>
          <Typography variant="body2" style={{ color: Colors.gray2, fontSize: "1.1em", fontFamily: Fonts.body }}>
            No Logo
            <CustomTooltip
              title={<span>Disable watermark logo.</span>}
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
            style={{ fontSize: isMobile ? "1.5rem" : "1.1rem", color: Colors.offwhite }}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2} style={{ marginTop: "16px" }}>
          <GenerateButton {...{ handleButtonClick, isLoading, isInputChanged }} />
        </Grid>
      </Grid>
    </Box>
  )
})
