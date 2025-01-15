
    import React, { useState, useEffect, memo } from "react"
    import {
      Box,
      Paper,
      Typography,
      Menu,
      MenuItem,
      TextField,
      Checkbox,
      IconButton,
      Button,
    } from "@mui/material"
    import InfoIcon from "@mui/icons-material/Info"
    import { Colors, Fonts } from "../../config/global"
    import { CustomTooltip } from "../CustomTooltip"
    import { GenerateButton } from "./GenerateButton"
    import Grid from "@mui/material/Grid2"
    
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
      // Local state
      const [anchorEl, setAnchorEl] = useState(null)

      // If needed, close menu or reset local state when the image changes
      useEffect(() => {
        // Example: If new image arrives, close menu just in case
        setAnchorEl(null)
      }, [image])

      const { width, height, seed, enhance = false, nologo = true, model } = image
    
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
        let newValue
        if (param === "model") {
          newValue = value
        } else {
          const parsedValue = parseInt(value, 10)
          newValue = isNaN(parsedValue) ? "" : parsedValue
        }
    
        if (image[param] !== newValue) {
          setIsInputChanged(true)
        }
        handleParamChange(param, newValue)
      }
    
      const isEnhanceChecked = enhance !== false
      const isLogoChecked = !nologo
    
      if (!image.imageURL) {
        return (
          <Typography component="div" variant="body2" style={{ color: Colors.offwhite }}>
            Loading...
          </Typography>
        )
      }
    
      return (
        <Box
          component={Paper}
          sx={{
            border: "none",
            boxShadow: "none",
            backgroundColor: "transparent",
          }}
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4, md: 2 }}>
              <Typography
                component="div"
                variant="body2"
                sx={{ color: Colors.gray2, fontSize: "1.1em", fontFamily: Fonts.body }}
              >
                Model
              </Typography>
              <Button
                variant="outlined"
                aria-controls="model-menu"
                aria-haspopup="true"
                onClick={handleMenuOpen}
                onFocus={handleFocus}
                sx={{
                  color: Colors.offwhite,
                  width: "100%",
                  justifyContent: "flex-start",
                  height: "56px",
                  fontSize: { xs: "1.5rem", md: "1.1rem" },
                  border: `solid 0.1px ${Colors.gray2}`,
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
                MenuListProps={{
                  sx: {
                    textAlign: "left",
                    backgroundColor: Colors.offblack,
                    color: Colors.offwhite,
                  },
                }}
              >
                <MenuItem
                  onClick={() => handleMenuClose("flux")}
                  sx={{
                    backgroundColor: Colors.offblack,
                    color: Colors.offwhite,
                    "&:hover": {
                      backgroundColor: Colors.offwhite,
                      color: Colors.offblack,
                    },
                  }}
                >
                  Flux
                </MenuItem>
                <MenuItem
                  onClick={() => handleMenuClose("flux-pro")}
                  sx={{
                    backgroundColor: Colors.offblack,
                    color: Colors.offwhite,
                    "&:hover": {
                      backgroundColor: Colors.offwhite,
                      color: Colors.offblack,
                    },
                  }}
                >
                  Flux-Pro
                </MenuItem>
                <MenuItem
                  onClick={() => handleMenuClose("flux-realism")}
                  sx={{
                    backgroundColor: Colors.offblack,
                    color: Colors.offwhite,
                    "&:hover": {
                      backgroundColor: Colors.offwhite,
                      color: Colors.offblack,
                    },
                  }}
                >
                  Flux-Realism
                </MenuItem>
                <MenuItem
                  onClick={() => handleMenuClose("flux-anime")}
                  sx={{
                    backgroundColor: Colors.offblack,
                    color: Colors.offwhite,
                    "&:hover": {
                      backgroundColor: Colors.offwhite,
                      color: Colors.offblack,
                    },
                  }}
                >
                  Flux-Anime
                </MenuItem>
                <MenuItem
                  onClick={() => handleMenuClose("flux-3d")}
                  sx={{
                    backgroundColor: Colors.offblack,
                    color: Colors.offwhite,
                    "&:hover": {
                      backgroundColor: Colors.offwhite,
                      color: Colors.offblack,
                    },
                  }}
                >
                  Flux-3D
                </MenuItem>
                <MenuItem
                  onClick={() => handleMenuClose("flux-cablyai")}
                  sx={{
                    backgroundColor: Colors.offblack,
                    color: Colors.offwhite,
                    "&:hover": {
                      backgroundColor: Colors.offwhite,
                      color: Colors.offblack,
                    },
                  }}
                >
                  Flux-CablyAI
                </MenuItem>
                <MenuItem
                  onClick={() => handleMenuClose("turbo")}
                  sx={{
                    backgroundColor: Colors.offblack,
                    color: Colors.offwhite,
                    "&:hover": {
                      backgroundColor: Colors.offwhite,
                      color: Colors.offblack,
                    },
                  }}
                >
                  Turbo
                </MenuItem>
              </Menu>
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Typography
                component="div"
                variant="body2"
                sx={{ color: Colors.gray2, fontSize: "1.1em", fontFamily: Fonts.body }}
              >
                Width
              </Typography>
              <TextField
                variant="outlined"
                value={width}
                onChange={(e) => handleInputChange("width", e.target.value)}
                onFocus={handleFocus}
                type="number"
                InputProps={{
                  sx: {
                    color: Colors.offwhite,
                    fontSize: { xs: "1.5rem", md: "1.1rem" },
                    border: `solid 0.1px ${Colors.gray2}`,
                    borderRadius: "4px",
                  },
                }}
                sx={{ width: "100%" }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Typography
                component="div"
                variant="body2"
                sx={{ color: Colors.gray2, fontSize: "1.1em", fontFamily: Fonts.body }}
              >
                Height
              </Typography>
              <TextField
                variant="outlined"
                value={height}
                onChange={(e) => handleInputChange("height", e.target.value)}
                onFocus={handleFocus}
                type="number"
                InputProps={{
                  sx: {
                    color: Colors.offwhite,
                    fontSize: { xs: "1.5rem", md: "1.1rem" },
                    border: `solid 0.1px ${Colors.gray2}`,
                    borderRadius: "4px",
                  },
                }}
                sx={{ width: "100%" }}
              />
            </Grid>
            <Grid size={{ xs: 4, sm: 4, md: 2 }}>
              <Typography
                component="div"
                variant="body2"
                sx={{ color: Colors.gray2, fontSize: "1.1em", fontFamily: Fonts.body }}
              >
                Seed
              </Typography>
              <TextField
                fullWidth
                variant="outlined"
                value={seed}
                onChange={(e) => handleInputChange("seed", e.target.value)}
                onFocus={handleFocus}
                type="number"
                InputProps={{
                  sx: {
                    color: Colors.offwhite,
                    fontSize: { xs: "1.5rem", md: "1.1rem" },
                    border: `solid 0.1px ${Colors.gray2}`,
                    borderRadius: "4px",
                  },
                }}
              />
            </Grid>
            <Grid size={{ xs: 4, sm: 2, md: 1 }}>
              <Typography
                component="div"
                variant="body2"
                sx={{ color: Colors.gray2, fontSize: "1.1em", fontFamily: Fonts.body }}
              >
                Enhance
                <CustomTooltip
                  title="AI prompt enhancer that helps create better images by improving your text prompt."
                  interactive="true"
                  sx={{ color: Colors.lime }}
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
                sx={{
                  color: Colors.offwhite,
                  "& .MuiSvgIcon-root": { fontSize: { xs: "1.5rem", md: "1.1rem" } },
                }}
              />
            </Grid>
            <Grid size={{ xs: 4, sm: 2, md: 1 }}>
              <Typography
                component="div"
                variant="body2"
                sx={{ color: Colors.gray2, fontSize: "1.1em", fontFamily: Fonts.body }}
              >
                Logo
                <CustomTooltip
                  title={<span>Enable watermark logo.</span>}
                  interactive="true"
                  sx={{ color: Colors.lime }}
                >
                  <IconButton size="small">
                    <InfoIcon fontSize="small" />
                  </IconButton>
                </CustomTooltip>
              </Typography>
              <Checkbox
                checked={isLogoChecked}
                onChange={(e) => handleInputChange("nologo", !e.target.checked)}
                onFocus={handleFocus}
                sx={{
                  color: Colors.offwhite,
                  "& .MuiSvgIcon-root": { fontSize: { xs: "1.5rem", md: "1.1rem" } },
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4, md: 2 }} style={{ marginTop: "24px" }}>
              <GenerateButton {...{ handleButtonClick, isLoading, isInputChanged }} />
            </Grid>
          </Grid>
        </Box>
      )
    })

