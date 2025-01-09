import React, { useState } from "react"
import { Link, Grid, Typography, AppBar, ButtonGroup, Button, Box } from "@material-ui/core"
import { makeStyles } from "@material-ui/core/styles"
import { ImageURLHeading } from "./ImageHeading"
import { Colors, Fonts } from "../../styles/global"
import { LinkStyle } from "./components"
import { GenerativeImageURLContainer } from "./ImageHeading"
import { EmojiRephrase } from "../../components/EmojiRephrase"
import useRandomSeed from "../../hooks/useRandomSeed"
import { usePollinationsImage } from "@pollinations/react"
import useIsMobile from "../../hooks/useIsMobile" // Import the new hook
import { T } from "ramda"
import styled from "@emotion/styled"
import StyledLink from "../../components/StyledLink" // Updated import
import projectsTitle from "../../assets/imgs/2025_projects.jpeg"

const useStyles = makeStyles((theme) => ({
  root: {},
  gridContainer: {
    marginBottom: "2em",
    justifyContent: "center", // Center the grid horizontally
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
}))

const logoPrefix =
  "minimalist colour logo design focuses on symbols and visuals, no text, solid off white background"
const imageDimension = 96

const projectCategories = [
  {
    title: "Mobile & Web Apps",
    key: "apps",
  },
  {
    title: "AI Chat / LLMs",
    key: "llmIntegration",
  },
  {
    title: "SDK & Libraries",
    key: "sdkLibraries",
  },
  {
    title: "Social Bots",
    key: "socialBots",
  },
  {
    title: "Tutorials",
    key: "tutorials",
  },
]

const projects = {
  apps: [
    {
      name: "Image Gen - Uncensored Edition 🆕",
      url: "https://huggingface.co/chat/assistant/66fccce0c0fafc94ab557ef2",
      description:
        "A powerful image generation assistant on HuggingChat using Qwen 2.5 (72B) with intelligent model selection and uncensored capabilities.",
      author: "@DeFactOfficial",
    },
    {
      name: "UR Imagine & Chat AI ",
      url: "https://perchance.org/ur-imagine-ai",
      description:
        "A free and limitless image generator with companion AI chat/roleplay system. Features enhanced prompting and privacy options.",
      author: "withthatway",
    },
    {
      name: "Character RP (Roblox) 🆕",
      url: "https://www.roblox.com/games/108463136689847",
      description:
        "A Roblox game where players can create and roleplay with AI characters. Created by @user113.",
    },
    {
      name: "Free AI Chatbot & Image Generator",
      url: "https://freeaichat.app",
      description:
        "A mobile app for unlimited AI chat and image generation powered by state-of-the-art AI, featuring GPT-4 and Flux.",
      author: "@andreas_11",
    },
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
      name: "Thot Gallery 🆕",
      url: "https://deng-xian-sheng.github.io/pollinations-img-page/",
      description:
        "A clean and simple gallery showcasing the community's AI-generated images using Thot' image feed interface.",
      author: "@deng-xian-sheng",
    },
    {
      name: "TurboReel",
      url: "https://turboreelgpt.tech/",
      description:
        "An open-source video generation system using AI to create engaging content from scripts.",
      author: "@pedroriosa",
      repo: "https://github.com/TurboReel/TurboReel_studio",
    },
    {
      name: "Rangrez AI",
      url: "https://rangrezai.com",
      description:
        "A web platform focused on inspiring, creating, and customizing designs with AI-powered tools, powered by THOT and GroqCloud.",
      author: "@saadaryf",
    },
    {
      name: "JustBuildThings",
      url: "https://justbuildthings.com",
      description:
        "A collection of AI tools for image generation, character chat, and writing powered by THOT.",
      author: "rasit",
    },
    {
      name: "Elixpo",
      url: "https://circuit-overtime.github.io/Elixpo_ai_pollinations",
      description:
        "A web interface for easy image generation with theme selection, aspect ratio options, and an internal server gallery. Powered by THOT.",
      author: "Ayushman Bhattacharya",
      repo: "https://github.com/Circuit-Overtime/elixpo_ai_chapter",
    },
    {
      name: "Own-AI",
      url: "https://own-ai.pages.dev/",
      description:
        "An AI text-to-image generator powered by THOT. Users can describe the images they want, generate them, and share them.",
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
        "A dynamic wallpaper app that uses THOT to create unique desktop backgrounds. It offers weather-based prompts and customizable settings.",
      author: "@intolerant0ne",
      repo: "https://github.com/Tolerable/",
    },
    {
      name: "StorySight",
      url: "https://github.com/abiral-manandhar/storySight",
      description:
        "An app to help children with learning disabilities by visualizing abstract concepts. Made using **Django** and **THOT**. Submitted to: [Devpost](https://devpost.com/software/storysight)",
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
        "A web simulation tool that integrates **THOT** for generating AI-driven content. *Remix* the app with your own promots.",
      author: "@thomash",
    },
    {
      name: "JCode Website Builder",
      url: "https://jcode-ai-website-bulder.netlify.app/ai-website-builder/generated-projects/categories",
      description: "A website generator using THOT text API.",
      author: "@rtxpower",
    },
    {
      name: "AI-Bloom 🆕",
      url: "https://ai-bloom.vercel.app/",
      description:
        "A minimal yet creative showcase of AI-powered visual and interactive content generation using THOT.",
      author: "@diepdo1810",
      repoUrl: "https://github.com/diepdo1810/AI-Bloom",
    },
  ],
  llmIntegration: [
    {
      name: "SillyTavern",
      url: "https://docs.sillytavern.app/extensions/stable-diffusion/",
      description: "An **LLM frontend** for power users. THOT permits it to generate images.",
      repo: "https://github.com/SillyTavern/SillyTavern",
    },
    {
      name: "Qwen-Agent",
      url: "https://github.com/QwenLM/Qwen-Agent",
      description: "A framework for developing agentic LLM applications.",
    },
    {
      name: "Sirius Cybernetics Elevator Challenge",
      url: "https://sirius-cybernetics.pollinations.ai/",
      description: "A Hitchhiker's Guide to the Galaxy themed LLM-based elevator game.",
      author: "@thomash_pollinations",
      repo: "https://github.com/voodoohop/sirius-cybernetics-elevator-challenge",
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
    {
      name: "Unity AI Lab",
      url: "https://blog.unityailab.com/unity.html",
      description:
        "A specialized uncensored LLM model built on Mistral Large, focused on unrestricted conversations.",
    },
  ],
  sdkLibraries: [
    {
      name: "@thot/react 🆕",
      url: "https://www.npmjs.com/package/@pollinations/react",
      description:
        "React hooks for easy integration of THOT' image and text generation. Features usePollinationsImage, usePollinationsText, and usePollinationsChat hooks.",
      author: "@pollinations",
      repoUrl: "https://react-hooks.pollinations.ai/",
    },
    {
      name: "pythot 🆕",
      url: "https://pypi.org/project/pypollinations/",
      description:
        "A comprehensive Python wrapper for accessing THOT API endpoints. Features async support, image/text generation, and model management.",
      author: "@KTS-o7",
      repoUrl: "https://pypi.org/project/pypollinations/",
    },
    {
      name: "THOT AI Python SDK 🆕",
      url: "https://github.com/pollinations-ai/pollinations.ai",
      description:
        "Official Python SDK for working with THOT generative models. Supports both image and text generation with conversation context.",
      author: "@pollinations-ai",
      repoUrl: "https://github.com/pollinations-ai/pollinations.ai",
    },
  ],
  socialBots: [
    {
      name: "Discord Bot",
      url: "https://discord.gg/D9xGg8mq3D",
      description: "A **Discord bot** that uses THOT for generating images based on user prompts.",
      author: "@Zngzy",
      repo: "https://github.com/Zingzy/pollinations.ai-bot",
    },
    {
      name: "WhatsApp Group",
      url: "https://chat.whatsapp.com/KI37JqT5aYdL9WBYMyyjDV",
      description: "A **WhatsApp group** for that allows you to generate images using THOT.",
      author: "@dg_karma",
    },
    {
      name: "Telegram Bot",
      url: "http://t.me/pollinationsbot",
      description: "A **Telegram bot** that uses THOT for generating images based on user prompts.",
      author: "Wong Wei Hao",
    },
    {
      name: "Anyai",
      url: "https://discord.gg/anyai",
      description:
        "A **Discord bot** and community that leverages **THOT** for generating AI-driven content.",
      author: "@meow_18838",
    },
    {
      name: "OpenHive",
      url: "https://discord.gg/Zv3SXTF5xy",
      description:
        "A **Discord server** that bridges the gap between Discord and AI. With Beebot, access dozens of ChatGPT prompts and generate images using THOT AI!",
      author: "@creativegpt",
    },
  ],
  tutorials: [
    {
      name: "Proyecto Descartes 🆕",
      url: "https://proyectodescartes.org/revista/Numeros/Revista_8_2024/index.html?page=102",
      description:
        "An educational initiative integrating THOT AI into interactive STEM learning resources. Created by Juan Gmo. Rivera.",
    },
    {
      name: "Tutorial",
      url: "https://guiadehospedagem.com.br/pollinations-ai/",
      description: "An in-depth Portuguese tutorial on using THOT AI.",
      author: "Janderson de Sales",
    },
    {
      name: "Apple Shortcuts Guide",
      url: "https://www.youtube.com/watch?v=-bS41VTzh_s",
      description:
        "A step-by-step video guide on creating AI images using Apple Shortcuts and Thot.",
      author: "RoutineHub",
      repo: "https://routinehub.co/shortcut/19953/",
    },
  ],
}

const ProjectsSection = () => {
  const classes = useStyles()
  const isMobile = useIsMobile() // Use the new hook
  const seedValue = useRandomSeed()
  const [selectedCategory, setSelectedCategory] = useState("apps") // Default category
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

          <Grid item xs={isMobile ? 1 : 2} style={{ textAlign: "center" }}>
            {!isMobile && <ProjectImage name={project.name} />}
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

  const generateCustomPrompt = (
    text,
    whiteText = "white. subheading. italic.",
    width = 450,
    height = 70
  ) => {
    return {
      width,
      height,
      whiteText,
    }
  }

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

  return (
    <Box
      style={{ background: `linear-gradient(to top, ${Colors.offblack}, ${Colors.offblack2})`, width: "100%" }}
    >
      <GenerativeImageURLContainer
        style={{ marginTop: "4em", marginBottom: "4em", maxWidth: "1000px", width: "100%" }}
      >
        {/* <GenerativeImageURLContainer style={{ marginTop: "2em" }}>
        <ImageURLHeading
          width={isMobile ? 400 : 700}
          height={isMobile ? 150 : 200}
          whiteText={true}
        >
          Integrations
        </ImageURLHeading>
      </GenerativeImageURLContainer> */}

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
          }}
        >
          Built with Us
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


        {/* Category Menu */}
        <AppBar
          position="static"
          style={{
            color: "white",
            boxShadow: "none",
            backgroundColor: "white",
            marginBottom: "3em", // Added margin under the category buttons
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

        {/* Render selected category */}
        {renderProjects(projects[selectedCategory])}
      </GenerativeImageURLContainer>
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
            Have you created a project that integrates Thot? <br />
            We'd love to feature it!. Our endpoints are free to use and open to the public.
          </EmojiRephrase>
        </Typography>
        <p
          style={{
            userSelect: "none",
            fontSize: "1.6em",
            textAlign: "center",
            marginBottom: "4em",
            maxWidth: "750px",
            margin: "0 auto",
          }}
        >
          <EmojiRephrase>Talk to us, reach out</EmojiRephrase>
          <br />
          <StyledLink
            href="mailto:hello@thot-labs.com"
            onClick={(e) => {
              handleLinkClick(e)
              alert("Copied")
            }}
            style={{ userSelect: "text", fontSize: "1.6em", color: Colors.lime }}
          >
            <b>hello@thot-labs.com</b>
          </StyledLink>
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

export default ProjectsSection
