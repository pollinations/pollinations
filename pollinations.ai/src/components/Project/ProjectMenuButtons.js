import React from "react"
import { AppBar, ButtonGroup, Button } from "@mui/material"
import { projectCategories } from "../../config/projectList"
import { Colors } from "../../config/global"


function CodeTypeSelector({ setSelectedCategory, selectedCategory }) {
  return (
    <AppBar
      position="static"
      style={{
        color: "white",
        boxShadow: "none",
        backgroundColor: "white",
      }}
    >
      <ButtonGroup
        variant="contained"
        aria-label="contained primary button group"
        style={{
          backgroundColor: "transparent",
          flexWrap: "wrap",
          justifyContent: "center",
          boxShadow: "none",
        }}
      >
        {projectCategories.map((category) => {
          const isActive = selectedCategory === category.key;
          return (
            <Button
              key={category.key}
              onClick={() => setSelectedCategory(category.key)}
              style={{
                backgroundColor: isActive ? Colors.lime : "transparent",
                color: isActive ? Colors.offblack : Colors.lime,
                fontSize: "1.3rem",
                fontFamily: "Uncut-Sans-Variable",
                fontStyle: "normal",
                fontWeight: 600,
                height: "60px",
                position: "relative",
                margin: "0.5em",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                letterSpacing: "0.1em",
                borderRadius: "5px",
                padding: "0 1em",
                whiteSpace: "nowrap",
                border: `1px solid ${Colors.lime}`,
              }}
            >
              {category.title}
            </Button>
          )
        })}
      </ButtonGroup>
    </AppBar>
  )
}

export { CodeTypeSelector }
