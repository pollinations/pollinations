import React, { useContext } from "react"
import {
  useMediaQuery,
  Box,
  Link,
  Grid,
  Typography,
} from "@material-ui/core"
import { makeStyles, useTheme } from "@material-ui/core/styles"
import { ImageURLHeading } from "./ImageHeading"
import { Colors, Fonts } from "../../styles/global"
import Markdown from "markdown-to-jsx"
import { LinkStyle } from "./components"
import styled from "@emotion/styled"
import { GenerativeImageURLContainer } from "./ImageHeading"
import { ImageContext } from "../../contexts/ImageContext"

const useStyles = makeStyles((theme) => ({
  root: {},
  gridContainer: {
    marginBottom: "2em",

  },
  gridItem: {
    padding: "8px 16px", // Tighter padding
    fontSize: "1.1em", // Larger text size
    display: "flex",
    alignItems: "center", // Align items vertically to the center
  },
  projectImage: {
    width: "48px", // Smaller image size
    height: "48px",
    objectFit: "cover",
    margin: "10px"
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
    color: Colors.white,
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
}))

const logoPrefix = "minimalist colour logo design focuses on symbols and visuals, no text, solid black background"
const imageDimension = 96
const seedValue = 41 + Math.floor(Math.random() * 3) // Define the seed value here

const projects = {
  llmIntegration: [
    {
      name: "SillyTavern",
      url: "https://docs.sillytavern.app/extensions/stable-diffusion/",
      description:
        "An **LLM frontend** for power users. Pollinations permits it to generate images.",
      repo: "https://github.com/SillyTavern/SillyTavern",
    },
    {
      name: "Qwen-Agent",
      url: "https://github.com/QwenLM/Qwen-Agent",
      description: "A framework for developing agentic LLM applications.",
    },
    {
      name: "LobeChat",
      url: "https://lobehub.com/plugins/pollinations-drawing",
      description:
        "An open-source, modern-design ChatGPT/LLMs UI/Framework. Supports speech-synthesis, multi-modal, and extensible (function call) plugin system.",
      repo: "https://github.com/lobehub/lobe-chat",
    },
    {
      name: "DynaSpark AI",
      url: "https://dynaspark.onrender.com",
      description:
        "An versatile AI assistant with advanced image and text generation capabilities, integrating Pollinations.ai for image generation.",
      author: "Th3-C0der",
      repo: "https://github.com/Th3-C0der",
    },
    {
      name: "FlowGPT",
      url: "https://flowgpt.com/p/instant-image-generation-with-chatgpt-and-pollinationsai",
      description: "Generate images on-demand with **ChatGPT**.",
    },
  ],
  socialBots: [
    {
      name: "Discord Bot",
      url: "https://discord.gg/D9xGg8mq3D",
      description:
        "A **Discord bot** that uses Pollinations.ai for generating images based on user prompts.",
      author: "@Zngzy",
      repo: "https://github.com/Zingzy/pollinations.ai-bot",
    },
    {
      name: "WhatsApp Group",
      url: "https://chat.whatsapp.com/KI37JqT5aYdL9WBYMyyjDV",
      description:
        "A **WhatsApp group** for that allows you to generate images using Pollinations.ai.",
      author: "@dg_karma",
    },
    {
      name: "Telegram Bot",
      url: "http://t.me/pollinationsbot",
      description:
        "A **Telegram bot** that uses Pollinations.ai for generating images based on user prompts.",
      author: "Wong Wei Hao",
    },
    {
      name: "Anyai",
      url: "#",
      description:
        "A **Discord bot** and community that amongst others leverages **Pollinations.ai** for generating AI-driven content.",
      author: "@meow_18838",
    },
    {
      name: "OpenHive",
      url: "https://discord.gg/Zv3SXTF5xy",
      description:
        "A **Discord server** that bridges the gap between Discord and AI. With Beebot, access dozens of ChatGPT prompts and generate images using Pollinations.ai!",
      author: "@creativegpt",
    },
  ],
  apps: [
    {
      name: "Pollinator Android App",
      url: "https://github.com/g-aggarwal/Pollinator",
      description:
        "An open-source **Android app** for text-to-image generation using Pollinations.ai's endpoint.",
      author: "@gaurav_87680",
    },
    {
      name: "MIDIjourney",
      url: "https://github.com/korus-labs/MIDIjourney",
      description: "An AI-powered plugin for Ableton Live that turns text descriptions into music.",
      author: "KORUS Labs",
      repo: "https://github.com/korus-labs/MIDIjourney",
    },
    {
      name: "Own-AI",
      url: "https://own-ai.pages.dev/",
      description:
        "An AI text-to-image generator powered by Pollinations.ai. Users can describe the images they want, generate them, and share them.",
      author: "Sujal Goswami",
      repo: "https://github.com/sujal-goswami/Own-AI",
    },
    {
      name: "Infinite Tales",
      url: "https://infinite-tales-rpg.vercel.app/",
      description:
        "A Choose Your Own Adventure RPG, dynamically narrated by AI. Customize your adventure, build your hero, and explore vast lands. Each journey is uniquely generated by AI.",
      author: "JayJayBinks",
      repo: "https://github.com/JayJayBinks/infinite-tales-rpg",
    },
    {
      name: "POLLIPAPER",
      url: "https://github.com/Tolerable/POLLIPAPER",
      description:
        "A dynamic wallpaper app that uses Pollinations AI to create unique desktop backgrounds. It offers weather-based prompts and customizable settings.",
      author: "@intolerant0ne",
      repo: "https://github.com/Tolerable/",
    },
    {
      name: "StorySight",
      url: "https://github.com/abiral-manandhar/storySight",
      description:
        "An app to help children with learning disabilities by visualizing abstract concepts. Made using **Django** and **Pollinations.ai**. Submitted to: [Devpost](https://devpost.com/software/storysight)",
    },
    {
      name: "StoryWeaver",
      url: "https://devpost.com/software/storyweaver-013xdw",
      description:
        "StoryWeaver crafts personalized picture books for children based on themes and prompts you choose, bringing your unique story ideas to life with AI!",
      author: "Advaith Narayanan, Omeed Sabouri, Yufan Wang",
      repo: "https://github.com/AdvaithN1/StoryWeaver",
    },
    {
      name: "Websim",
      url: "https://websim.ai/c/bXsmNE96e3op5rtUS",
      description:
        "A web simulation tool that integrates **Pollinations.ai** for generating AI-driven content. *Remix* the app with your own promots.",
      author: "@thomash_pollinations",
    },
  ],
  tutorials: [
    {
      name: "Tutorial",
      url: "https://guiadehospedagem.com.br/pollinations-ai/",
      description: "An in-depth Portuguese tutorial on using Pollinations AI.",
      author: "Janderson de Sales",
    },
  ],
}

const generateImageUrl = (name) =>
  `https://pollinations.ai/p/${encodeURIComponent(`${logoPrefix} ${name}`)}?width=${imageDimension * 4
  }&height=${imageDimension * 4}&nologo=true&seed=${seedValue}`

const ProjectsSection = () => {
  const classes = useStyles()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"))

  const renderProjects = (projectList) => (
    <Grid container spacing={2} className={classes.gridContainer}>
      {!isMobile
        ? projectList.map((project, index) => (
          <Grid container item xs={12} key={index} className={classes.gridItem}>
            <Grid item xs={3} style={{ textAlign: "right" }}>
              {renderProjectLink(project)}
              {project.author && (
                <div style={{ marginTop: "5px", color: Colors.white, fontSize: "1em" }}>
                  by {project.author}
                </div>
              )}
            </Grid>
            <Grid item xs={1.1} style={{ textAlign: "left" }}>
              <img
                src={generateImageUrl(project.name)}
                alt={project.name}
                className={classes.projectImage}
                style={{ width: imageDimension, height: imageDimension }}
              />
            </Grid>
            <Grid item xs={4} style={{ textAlign: "left" }}>
              <span style={{ color: Colors.white, fontSize: "1em" }}>
                <Markdown>{project.description}</Markdown>
              </span>
              <br />
              {project.repo && renderRepoLink(project.repo)}
            </Grid>
          </Grid>
        ))
        : projectList.reduce((rows, project, index) => {
          if (index % 2 === 0) {
            rows.push([]);
          }
          rows[rows.length - 1].push(project);
          return rows;
        }, []).map((row, rowIndex) => (
          <Grid container item xs={12} key={rowIndex} className={classes.gridItem}>
            {row.map((project, colIndex) => (
              <Grid item xs={6} key={colIndex} style={{ textAlign: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <img
                    src={generateImageUrl(project.name)}
                    alt={project.name}
                    className={classes.projectImage}
                    style={{ width: imageDimension, height: imageDimension }}
                  />
                  {renderProjectLink(project)}
                  {project.author && (
                    <div style={{ marginTop: "5px", color: Colors.white, fontSize: "1em", maxWidth: "50%" }}>
                      by {project.author}
                    </div>
                  )}
                  {project.repo && (
                    <div style={{ marginTop: "5px", fontSize: "1em" }}>
                      <LinkStyle href={project.repo} target="_blank" rel="noopener noreferrer" style={{ color: Colors.lime }}>
                        GitHub
                      </LinkStyle>
                    </div>
                  )}
                </div>
              </Grid>
            ))}
            {row.length < 2 && <Grid item xs={6} />} {/* Empty cell for alignment */}
          </Grid>
        ))}
    </Grid>
  )

  return (
    <GenerativeImageURLContainer
      style={{ marginTop: "2em", marginBottom: "4em", maxWidth: "1000px" }}
    >
            <GenerativeImageURLContainer style={{ marginTop: "2em" }}>
        <ImageURLHeading width={isMobile ? 400 : 700} height={isMobile ? 150 : 200}>
          Integrations
        </ImageURLHeading>
      </GenerativeImageURLContainer>
      <ImageURLHeading
        className={classes.scaledImageURLHeading}
        width={350}
        height={70}
        whiteText={"white"}
      >
        AI Chat / LLMs
      </ImageURLHeading>
      {renderProjects(projects.llmIntegration)}

      <ImageURLHeading
        className={classes.scaledImageURLHeading}
        width={350}
        height={70}
        whiteText={"white"}
      >
        Social Bots
      </ImageURLHeading>
      {renderProjects(projects.socialBots)}

      <ImageURLHeading
        className={classes.scaledImageURLHeading}
        width={350}
        height={70}
        whiteText={"white"}
      >
        Mobile & Web Apps
      </ImageURLHeading>
      {renderProjects(projects.apps)}

      <ImageURLHeading
        className={classes.scaledImageURLHeading}
        width={350}
        height={70}
        whiteText={"white"}
      >
        Tutorials
      </ImageURLHeading>
      {renderProjects(projects.tutorials)}

      <Typography className={classes.listProjectText} style={{ fontSize: "1.3em" }}>
        Have you created a project that integrates Pollinations? We'd love to feature it!
        <br />
        <ImageURLHeading
          className={classes.scaledImageURLHeading}
          width={300}
          height={50}
          whiteText={true}
          customPrompt={`an image with the text "Get in touch" displayed in an elegant, decorative serif font. The font has high contrast between thick and thin strokes, that give the text a sophisticated and stylized appearance. The text is in white, set against a solid black background, creating a striking and bold visual contrast. Incorporate elements related to pollinations, digital circuitry, such as flowers, chips, insects, wafers, and other organic forms into the design of the font. Each letter features unique, creative touches that make the typography stand out. Incorporate colorful elements related to pollinators and pollens, insects and plants into the design of the font. Make it very colorful with vibrant hues and gradients.`}
        ></ImageURLHeading>{" "}
        <LinkStyle
          href="mailto:hello@pollinations.ai"
          style={{ color: Colors.lime, fontSize: "1em" }}
        >
          hello@pollinations.ai
        </LinkStyle>
      </Typography>
    </GenerativeImageURLContainer>
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

export default ProjectsSection
