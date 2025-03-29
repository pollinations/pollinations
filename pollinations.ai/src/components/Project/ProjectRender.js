import React from "react"
import { Link, Box, useMediaQuery } from "@mui/material"
import Grid from "@mui/material/Grid2"
import { useTheme } from "@mui/material/styles"
import { ReactSVG } from "react-svg"

import { Colors, Fonts } from "../../config/global"
import StyledLink from "../StyledLink"
import { LLMTextManipulator } from "../LLMTextManipulator"
import useRandomSeed from "../../hooks/useRandomSeed"
import { usePollinationsImage } from "@pollinations/react"
import { PROJECT_LOGO_STYLE, PROJECT_DESCRIPTION } from "../../config/copywrite"
import { rephrase, emojify, shortTechnical } from "../../config/llmTransforms"
import { ICONS } from "../../assets/icons/icons"
import { trackEvent } from "../../config/analytics"
import { SectionSubContainer } from "../SectionContainer"

/**
 * Renders the list of projects for the selected category
 * @param {Object} props - Component props
 * @param {Array} props.projectList - List of projects to render
 * @param {Object} props.classes - CSS classes
 */
const ProjectsRender = ({ projectList, classes }) => {
  const theme = useTheme()
  const PROJECT_LOGO_SIZE = useMediaQuery(theme.breakpoints.down("md")) ? 80 : 96

  return (
    <>
      <Grid container spacing={0.5} className={classes.gridContainer}>
        {projectList?.map((project, index) => (
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
                  sx={{ padding: "1em" }}
                >
                  <Grid
                    size={{ xs: 12, md: 4 }}
                    marginBottom={{ xs: "0.5em", md: "0em" }}
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
                              onClick={() =>
                                trackEvent({
                                  action: "click_project_author",
                                  category: "project",
                                  value: project.author,
                                })
                              }
                            >
                              {project.author}
                            </Link>
                          ) : project.author.startsWith("[") && project.author.includes("](") ? (
                            (() => {
                              const match = project.author.match(/^\[(.*?)\]\((.*?)\)$/);
                              if (match) {
                                const displayName = match[1];
                                const userUrl = match[2];
                                return (
                                  <Link
                                    href={userUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: Colors.lime }}
                                    onClick={() =>
                                      trackEvent({
                                        action: "click_project_author",
                                        category: "project",
                                        value: displayName,
                                      })
                                    }
                                  >
                                    {displayName}
                                  </Link>
                                );
                              }
                              return project.author;
                            })()
                          ) : project.author.includes("http") ? (
                            <Link
                              href={project.author}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: Colors.lime }}
                            >
                              {project.author.split("/").pop()}
                            </Link>
                          ) : (
                            project.author
                          )}
                        </div>
                      )}
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 12, md: 8 }} style={{ textAlign: "left" }}>
                    <span
                      style={{
                        color: Colors.offwhite,
                        fontSize: "1em",
                        fontFamily: Fonts.parameter,
                      }}
                    >
                      <LLMTextManipulator
                        text={project.description}
                        transforms={[shortTechnical]}
                      />
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
      action: "click_project_title",
      category: "project",
      value: project.name,
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
      action: "click_project_repo",
      category: "project",
      value: repoUrl,
    })
  }

  return (
    <Link
      href={repoUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleRepoLinkClick}
      style={{
        color: Colors.lime,
        fontFamily: Fonts.parameter,
        fontWeight: "bold",
        fontSize: "1em",
        display: "flex",
        alignItems: "center",
      }}
    >
      <ReactSVG
        src={ICONS.github}
        beforeInjection={(svg) => {
          svg.setAttribute("fill", Colors.lime)
          svg.setAttribute(
            "style",
            "margin-right: 8px; background: transparent; vertical-align: middle;"
          )
          svg.setAttribute("width", "18")
          svg.setAttribute("height", "18")
        }}
      />
      <span style={{ display: "flex", alignItems: "center", verticalAlign: "middle" }}>GITHUB</span>
    </Link>
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
