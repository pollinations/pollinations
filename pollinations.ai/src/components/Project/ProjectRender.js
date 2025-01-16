import React from "react"
import { Link } from "@mui/material"
import { Colors, Fonts } from "../../config/global"
import StyledLink from "../StyledLink"
import { EmojiRephrase } from "../EmojiRephrase"
import useRandomSeed from "../../hooks/useRandomSeed"
import { usePollinationsImage } from "@pollinations/react"
import { PROJECT_LOGO_STYLE } from "../../config/copywrite"
import Grid from "@mui/material/Grid2"

const PROJECT_LOGO_SIZE = 96

const ProjectsRender = ({ projectList, classes }) => (
  <Grid container spacing={4} className={classes.gridContainer}>
    {projectList.map((project, index) => (
      <Grid
        container
        key={index}
        style={{
          flexDirection: "row",
          flexWrap: "nowrap",
          alignContent: "center",
          justifyContent: "center",
          alignItems: "center",
        }}
        className={classes.gridItem}
      >
        <Grid size={4} style={{ textAlign: "right" }}>
          {renderProjectLink(project)}
          {project.author && (
            <div style={{ marginTop: "5px", color: Colors.offwhite, fontSize: "1em" }}>
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
        </Grid>

        <Grid size={{ xs: 4, md: 2 }} style={{ textAlign: "center" }}>
          <ProjectImage name={project.name} />
        </Grid>

        <Grid size={{ xs: 3, md: 6 }} style={{ textAlign: "left" }}>
          <span style={{ color: Colors.offwhite, fontSize: "1em" }}>
            <EmojiRephrase>{project.description}</EmojiRephrase>
          </span>

          {project.repo && renderRepoLink(project.repo)}
        </Grid>
      </Grid>
    ))}
  </Grid>
)

const renderProjectLink = (project) => {
  return (
    <Link
      href={project.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: Colors.lime,
        fontFamily: Fonts.body,
        fontStyle: "normal",
        fontWeight: "500",
        fontSize: "1.4em",
        lineHeight: "22px",
        textDecoration: "none",
        maxWidth: "100px",
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

const ProjectImage = ({ name }) => {
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
