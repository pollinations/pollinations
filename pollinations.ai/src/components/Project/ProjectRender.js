import React, { useState } from "react"
import { Link, AppBar, ButtonGroup, Box } from "@mui/material"
import { Colors, Fonts } from "../../config/global"
import StyledLink from "../StyledLink"
import { LLMTextManipulator } from "../LLMTextManipulator"
import useRandomSeed from "../../hooks/useRandomSeed"
import { usePollinationsImage } from "@pollinations/react"
import { PROJECT_LOGO_STYLE, PROJECT_DESCRIPTION } from "../../config/copywrite"
import Grid from "@mui/material/Grid2"
import { projectCategories, projects } from "../../config/projectList"
import { GeneralButton } from "../GeneralButton"
import { SectionSubContainer } from "../SectionContainer"
import { useMediaQuery } from "@mui/material"
import { useTheme } from "@mui/material/styles"
import { ICONS } from "../../assets/icons/icons" // Import the ICONS
import { trackEvent } from "../../config/analytics" // Import trackEvent

const ProjectsRender = ({ classes }) => {
  const theme = useTheme()
  const PROJECT_LOGO_SIZE = useMediaQuery(theme.breakpoints.down("md")) ? 80 : 96
  const [selectedCategory, setSelectedCategory] = useState(projectCategories[0].key) // Default to index 1

  const handleCategoryClick = (categoryKey) => {
    setSelectedCategory(categoryKey)
    trackEvent({
      action: "Category_Select",
      category: "User_Interactions",
      label: `Category_${categoryKey}`,
      value: 1,
    })
  }

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
              handleClick={() => handleCategoryClick(category.key)}
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
                fontFamily: Fonts.title,
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
            <SectionSubContainer style={{ padding: "0em" }}>
              <Grid
                container
                style={{
                  flexDirection: "row",
                  flexWrap: "nowrap",
                  alignContent: "center",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                }}
                className={classes.gridItem}
              >
                <Grid size={{ xs: 4, md: 2 }} style={{ textAlign: "center" }}>
                  <ProjectImage
                    name={project.name}
                    description={project.description}
                    PROJECT_LOGO_SIZE={PROJECT_LOGO_SIZE}
                  />
                </Grid>
                <Grid
                  container
                  size={12}
                  direction="row"
                  sx={{ backgroundColor: `${Colors.offblack}50`, padding: "1em" }}
                >
                  <Grid
                    size={{ xs: 7, md: 4 }}
                    style={{
                      textAlign: "left",
                    }}
                  >
                    <Box style={{ maxWidth: "90%" }}>
                      {renderProjectLink(project)}
                      {project.author && (
                        <div
                          style={{
                            marginTop: "0.5em",
                            color: Colors.offwhite,
                            fontSize: "1em",
                            fontFamily: Fonts.parameter,
                          }}
                        >
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

                  <Grid size={{ xs: 5, md: 8 }} style={{ textAlign: "left" }}>
                    <span
                      style={{
                        color: Colors.offwhite,
                        fontSize: "1em",
                        fontFamily: Fonts.parameter,
                      }}
                    >
                      <LLMTextManipulator>
                        {PROJECT_DESCRIPTION + project.description}
                      </LLMTextManipulator>
                    </span>
                    {project.repo && renderRepoLink(project.repo)}
                  </Grid>
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
  const handleProjectLinkClick = () => {
    trackEvent({
      action: "Project_Link_Click",
      category: "User_Interactions",
      label: `Project_${project.name}_Link`,
      value: 1,
    })
  }

  return (
    <Link
      href={project.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleProjectLinkClick}
      sx={{
        color: Colors.lime,
        fontFamily: Fonts.parameter,
        fontStyle: "normal",
        fontWeight: "bold",
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
  const handleRepoLinkClick = () => {
    trackEvent({
      action: "Repo_Link_Click",
      category: "User_Interactions",
      label: "Repo_Link",
      value: 1,
    })
  }

  return (
    <StyledLink
      href={repoUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleRepoLinkClick}
      style={{
        color: Colors.lime,
        fontFamily: Fonts.parameter,
        fontSize: "1em",
        display: "flex",
        alignItems: "center",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 1024 1024"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        style={{ marginRight: "8px" }}
      >
        <path d={ICONS.github} />
      </svg>
      GitHub
    </StyledLink>
  )
}

const ProjectImage = ({ name, PROJECT_LOGO_SIZE, description }) => {
  const seed = useRandomSeed()
  const prompt = `${PROJECT_LOGO_STYLE} ${name} ${description}`
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
