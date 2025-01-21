import React, { useState } from "react"
import { Link, AppBar, ButtonGroup, Box } from "@mui/material"
import { Colors, Fonts } from "../../config/global"
import StyledLink from "../StyledLink"
import { LLMTextManipulator } from "../LLMTextManipulator"
import useRandomSeed from "../../hooks/useRandomSeed"
import { usePollinationsImage } from "@pollinations/react"
import { PROJECT_LOGO_STYLE, PROJECT_DESCRIPTION_STYLE } from "../../config/copywrite"
import Grid from "@mui/material/Grid2"
import { projectCategories, projects } from "../../config/projectList"
import { GeneralButton } from "../GeneralButton"
import { SectionSubContainer } from "../SectionContainer"
import { useMediaQuery } from "@mui/material"
import { useTheme } from "@mui/material/styles"

const ProjectsRender = ({ classes }) => {
  const theme = useTheme()
  const PROJECT_LOGO_SIZE = useMediaQuery(theme.breakpoints.down("md")) ? 80 : 96
  const [selectedCategory, setSelectedCategory] = useState(projectCategories[0].key) // Default to index 1

  const displayProjects = selectedCategory
    ? projects[selectedCategory] || []
    : Object.values(projects).flat()

  return (
    <>
      <AppBar
        position="static"
        style={{
          boxShadow: "none",
          backgroundColor: "transparent",
        }}
      >
        <ButtonGroup
          aria-label="contained primary button group"
          style={{
            backgroundColor: "transparent",
            flexWrap: "wrap",
            justifyContent: "space-between",
            boxShadow: "none",
          }}
        >
          {projectCategories.map((category, index) => (
            <GeneralButton
              key={category.key}
              handleClick={() => setSelectedCategory(category.key)}
              backgroundColor={selectedCategory === category.key ? Colors.lime : "transparent"}
              textColor={selectedCategory === category.key ? Colors.offblack : Colors.lime}
              fontSize="1.3rem"
              style={{
                fontStyle: "normal",
                fontWeight: 600,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {category.title}
            </GeneralButton>
          ))}
        </ButtonGroup>
      </AppBar>

      <Grid container spacing={0.5} className={classes.gridContainer}>
        {displayProjects.map((project, index) => (
          <React.Fragment key={index}>
            <SectionSubContainer style={{ backgroundColor: Colors.offblack2, padding: "0em" }}>
              <Grid
                container
                style={{
                  flexDirection: "row",
                  flexWrap: "nowrap",
                  alignContent: "center",
                  justifyContent: "space-between",
                  alignItems: "center",
                  border: `0px solid ${Colors.offwhite}`,
                  width: "100%",
                }}
                className={classes.gridItem}
              >
                <Grid size={{ xs: 4, md: 2 }} style={{ textAlign: "center" }}>
                  <ProjectImage name={project.name} PROJECT_LOGO_SIZE={PROJECT_LOGO_SIZE} />
                </Grid>

                <Grid size={4} style={{ textAlign: "left" }}>
                  <Box style={{ maxWidth: "90%" }}>
                    {renderProjectLink(project)}
                    {project.author && (
                      <div style={{ marginTop: "0.5em", color: Colors.offwhite, fontSize: "1em" }}>
                        by{" "}
                        {project.author.startsWith("@") ? (
                          <Link
                            href={`https://discord.com/users/${project.author.substring(1)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: Colors.lime }}
                          >
                            {project.author}
                          </Link>
                        ) : (
                          project.author
                        )}
                      </div>
                    )}
                  </Box>
                </Grid>

                <Grid size={{ xs: 3, md: 6 }} style={{ textAlign: "left" }}>
                  <span style={{ color: Colors.offwhite, fontSize: "1em" }}>
                    <LLMTextManipulator>
                      {PROJECT_DESCRIPTION_STYLE + project.description}
                    </LLMTextManipulator>
                  </span>
                  {project.repo && renderRepoLink(project.repo)}
                </Grid>
              </Grid>
            </SectionSubContainer>
          </React.Fragment>
        ))}
      </Grid>
    </>
  )
}

const renderProjectLink = (project) => {
  return (
    <Link
      href={project.url}
      target="_blank"
      rel="noopener noreferrer"
      sx={{
        color: Colors.lime,
        fontFamily: Fonts.body,
        fontStyle: "normal",
        fontWeight: "500",
        fontSize: { xs: "1em", md: "1.2em" },
        lineHeight: { xs: "20px", md: "28px" },
        textDecoration: "none",
        "&:hover": {
          textDecoration: "underline",
        },
      }}
    >
      {project.name}
    </Link>
  )
}

const renderRepoLink = (repoUrl) => {
  return (
    <StyledLink
      href={repoUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: Colors.lime,
      }}
    >
      GitHub
    </StyledLink>
  )
}

const ProjectImage = ({ name, PROJECT_LOGO_SIZE }) => {
  const seed = useRandomSeed()
  const prompt = `${PROJECT_LOGO_STYLE} ${name}`
  const imageUrl = usePollinationsImage(prompt, {
    width: PROJECT_LOGO_SIZE * 4,
    height: PROJECT_LOGO_SIZE * 4,
    nologo: true,
    seed,
  })

  return (
    <img
      src={imageUrl}
      alt={name}
      style={{ width: PROJECT_LOGO_SIZE, height: PROJECT_LOGO_SIZE, borderRadius: "1em" }}
    />
  )
}

export default ProjectsRender
