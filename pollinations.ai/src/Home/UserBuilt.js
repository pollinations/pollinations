import React, { useState } from "react"
import { Link, Grid, Typography, AppBar, ButtonGroup, Button, Box } from "@material-ui/core"
import { makeStyles } from "@material-ui/core/styles"
import { Colors, Fonts } from "../config/global"
import { LinkStyle } from "../config/style"
import { GenerativeImageURLContainer } from "../components/ImageHeading"
import { EmojiRephrase } from "../components/EmojiRephrase"
import useRandomSeed from "../hooks/useRandomSeed"
import { usePollinationsImage } from "@pollinations/react"
import { useTheme } from "@material-ui/core/styles"
import useMediaQuery from "@material-ui/core/useMediaQuery"
import StyledLink from "../components/StyledLink"
import { logoPrefix, projectCategories, projects, imageDimension } from "../config/userBuiltText"
import CopyEmailButton from "../components/CopyEmailButton"

const useStyles = makeStyles((theme) => ({
  root: {},
  gridContainer: {
    marginBottom: "2em",
    justifyContent: "center",
  },
  gridItem: {
    padding: "8px 16px",
    fontSize: "1.1em",
    display: "flex",
    alignItems: "center",
  },
  projectImage: {
    width: "48px",
    height: "48px",
    objectFit: "cover",
    margin: "10px",
  },
  sectionHeading: {
    color: Colors.lime,
    fontFamily: Fonts.body,
    fontStyle: "normal",
    fontWeight: "500",
    fontSize: "1.1em",
    lineHeight: "22px",
    marginTop: theme.spacing(4),
    marginBottom: theme.spacing(2),
    textAlign: "center",
  },
  listProjectText: {
    color: Colors.offwhite,
    textAlign: "center",
    marginTop: theme.spacing(4),
    marginBottom: theme.spacing(4),
    fontSize: "1.1em",
  },
  scaledImageURLHeading: {
    transform: "scale(1)",
    transformOrigin: "center",
    width: "100%",
    maxWidth: "100%",
  },
  callToActionContainer: {
    backgroundColor: Colors.offblack,
    padding: theme.spacing(4),
    borderRadius: "8px",
    textAlign: "center",
    border: `1px solid ${Colors.lime}`,
  },
  callToActionText: {
    color: Colors.lime,
    fontSize: "1.5em",
    maxWidth: "500px",
    margin: "0 auto",
  },
  callToActionLink: {
    color: Colors.offwhite,
    fontSize: "1em",
    textDecoration: "none",
    "&:hover": {
      textDecoration: "underline",
    },
  },
  projectsContainer: {
    maxHeight: "600px",
    overflowY: "auto",
    overflowX: "hidden",
    padding: "3em",
    borderRadius: "10px",
    scrollbarWidth: "thin",
    scrollbarColor: `${Colors.gray1} transparent`,
  },
}))

const UserBuilt = () => {
  const classes = useStyles()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"))
  const seedValue = useRandomSeed()
  const [selectedCategory, setSelectedCategory] = useState("apps")
  const categoryKeys = projectCategories.map((category) => category.key)

  const renderProjects = (projectList) => (
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
          <Grid item xs={4} style={{ textAlign: "right" }}>
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

          <Grid item xs={isMobile ? 4 : 2} style={{ textAlign: "center" }}>
            <ProjectImage name={project.name} />
          </Grid>

          <Grid item xs={isMobile ? 3 : 6} style={{ textAlign: "left" }}>
            <span style={{ color: Colors.offwhite, fontSize: "1em" }}>
              <EmojiRephrase>{project.description}</EmojiRephrase>
            </span>
            <br />
            {project.repo && renderRepoLink(project.repo)}
          </Grid>
        </Grid>
      ))}
    </Grid>
  )

  const buttonStyle = (isActive) => ({
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
  })

  const handleLinkClick = (e) => {
    e.preventDefault()
    navigator.clipboard.writeText("hello@thot-labs.com").then(() => {
      alert("Copied")
    })
  }

  return (
    <Box
      style={{
        background: `linear-gradient(to top, ${Colors.offblack}, ${Colors.offblack2})`,
        width: "100%",
      }}
    >
      <GenerativeImageURLContainer
        style={{ marginTop: "4em", marginBottom: "4em", maxWidth: "1000px", width: "100%" }}
      >
        <Typography
          variant="h1"
          style={{
            color: Colors.lime,
            fontSize: isMobile ? "4em" : "8em",
            fontWeight: "bold",
            textAlign: "center",
            margin: "0 auto",
            userSelect: "none",
            maxWidth: "750px",
            letterSpacing: "0.1em",
          }}
        >
          User Builds
        </Typography>

        <Typography
          style={{
            color: Colors.offwhite,
            fontSize: "1.5em",
            margin: "1em auto 2em auto",
            textAlign: "center",
            maxWidth: "750px",
          }}
        >
          <EmojiRephrase>
            Here are some of the various implementations that our API is currently powering.
          </EmojiRephrase>
        </Typography>

        <AppBar
          position="static"
          style={{
            color: "white",
            boxShadow: "none",
            backgroundColor: "white",
            marginBottom: "1em",
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
            {projectCategories.map((category) => (
              <Button
                key={category.key}
                onClick={() => setSelectedCategory(category.key)}
                style={buttonStyle(selectedCategory === category.key)}
              >
                {category.title}
              </Button>
            ))}
          </ButtonGroup>
        </AppBar>

        <Box
          className={classes.projectsContainer}
          style={{ backgroundColor: isMobile ? "transparent" : "rgba(0, 0, 0, 0.3)" }}
        >
          {renderProjects(projects[selectedCategory])}
        </Box>
      </GenerativeImageURLContainer>
      <Typography
        style={{
          color: Colors.offwhite,
          fontSize: "1.5em",
          margin: "1em auto 4em auto",
          textAlign: "center",
          maxWidth: "750px",
        }}
      >
        <EmojiRephrase>
          Have you created a project that integrates Thot? <br />
          We'd love to feature it!.
        </EmojiRephrase>
      </Typography>
      <p
        style={{
          userSelect: "none",
          fontSize: "1.6em",
          textAlign: "center",
          paddingBottom: "3em",
          maxWidth: "750px",
          margin: "0 auto",
        }}
      >
        <EmojiRephrase>Talk to us</EmojiRephrase>
        <Box
          maxWidth="1000px"
          marginX="auto"
          textAlign="center"
          marginBottom="3em"
          marginTop="1em"
        >
          <CopyEmailButton />
        </Box>
      </p>
    </Box>
  )
}

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
    <LinkStyle
      href={repoUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: Colors.lime,
      }}
    >
      GitHub
    </LinkStyle>
  )
}

const ProjectImage = ({ name }) => {
  const seed = useRandomSeed()
  const prompt = `${logoPrefix} ${name}`
  const imageUrl = usePollinationsImage(prompt, {
    width: imageDimension * 4,
    height: imageDimension * 4,
    nologo: true,
    seed,
  })

  return <img src={imageUrl} alt={name} style={{ width: imageDimension, height: imageDimension }} />
}

export default UserBuilt
