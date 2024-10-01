import React from "react"
import { Link, Grid, Typography } from "@material-ui/core"
import { makeStyles } from "@material-ui/core/styles"
import { ImageURLHeading } from "./ImageHeading"
import { Colors, Fonts } from "../../styles/global"
import { LinkStyle } from "./components"
import { GenerativeImageURLContainer } from "./ImageHeading"
import { EmojiRephrase } from "../../components/EmojiRephrase"
import useRandomSeed from "../../hooks/useRandomSeed"
import { usePollinationsImage } from "@pollinations/react"
import useIsMobile from "../../hooks/useIsMobile" // Import the new hook

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

const logoPrefix =
  "minimalist colour logo design focuses on symbols and visuals, no text, solid black background"
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
    title: "Social Bots",
    key: "socialBots",
  },
  {
    title: "Tutorials",
    key: "tutorials",
  },
]

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
      name: "Elixpo",
      url: "https://circuit-overtime.github.io/Elixpo_ai_pollinations/elixpo_homepage.html",
      description:
        "A web interface for easy image generation with theme selection, aspect ratio options, and an internal server gallery. Powered by Pollinations.ai.",
      author: "Ayushman Bhattacharya",
      repo: "https://github.com/Circuit-Overtime",
    },
    {
      name: "DevSaura AI",
      url: "https://ai.devsaura.com",
      description:
        "A web platform offering AI-powered tools for image generation, blog creation, and story writing with visuals, all powered by Pollinations and GroqCloud.",
      author: "@saadaryf",
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

const ProjectsSection = () => {
  const classes = useStyles()
  const isMobile = useIsMobile() // Use the new hook
  const seedValue = useRandomSeed()

  const renderProjects = (projectList) => (
    <Grid container spacing={4} className={classes.gridContainer}>
      {projectList.map((project, index) => (
        <Grid container item xs={10} key={index} className={classes.gridItem}>
          <Grid item xs={4} style={{ textAlign: "right" }}>
            {renderProjectLink(project)}
            {project.author && (
              <div style={{ marginTop: "5px", color: Colors.white, fontSize: "1em" }}>
                by {project.author}
              </div>
            )}
          </Grid>
          <Grid item xs={1.1} style={{ textAlign: "right" }}>
            <ProjectImage name={project.name} />
          </Grid>
          <Grid item xs={isMobile ? 4 : 6} style={{ textAlign: "left" }}>
            <span style={{ color: Colors.white, fontSize: "1em" }}>
              <EmojiRephrase>{project.description}</EmojiRephrase>
            </span>
            <br />
            {project.repo && renderRepoLink(project.repo)}
          </Grid>
        </Grid>
      ))}
    </Grid>
  )

  const generateCustomPrompt = (text, whiteText = "white. subheading. italic.", width = 450, height = 70) => {
    return {
      // customPrompt: `The word "${text}" is written in elegant letters on black background. The text is ${whiteText}, surrounded by a whole micro biosphere universe of small, colorful insects and tiny birds, with plants and insects crawling on top of the letters. It's a vibrant micro biome.`,
      width,
      height,
      whiteText,
    }
  }

  return (
    <GenerativeImageURLContainer
      style={{ marginTop: "0em", marginBottom: "4em", maxWidth: "1000px" }}
    >
      <GenerativeImageURLContainer style={{ marginTop: "2em" }}>
        <ImageURLHeading width={isMobile ? 400 : 700} height={isMobile ? 150 : 200}>
          Integrations
        </ImageURLHeading>
      </GenerativeImageURLContainer>
      {projectCategories.map((category) => (
        <React.Fragment key={category.key}>
          <ImageURLHeading
            className={classes.scaledImageURLHeading}
            {...generateCustomPrompt(category.title)}
          >
            {category.title}
          </ImageURLHeading>
          {renderProjects(projects[category.key])}
        </React.Fragment>
      ))}
      <div style={{ position: "relative" }}>
        <Typography className={classes.listProjectText} style={{ fontSize: "1.5em", maxWidth: "500px" }}>
          <EmojiRephrase>
            Have you created a project that integrates Pollinations? <br />
            We'd love to feature it!
          </EmojiRephrase>
          <ImageURLHeading
            width={100}
            height={50}
            className={classes.scaledImageURLHeading}
            {...generateCustomPrompt("Get in touch")}
          >
            Get in touch
          </ImageURLHeading>
          <LinkStyle
            href="mailto:hello@pollinations.ai"
            style={{ color: Colors.lime, fontSize: "1em" }}
          >
            hello@pollinations.ai
          </LinkStyle>
        </Typography>
      </div>
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

//      prompt: `The word "${text}" is written in elegant letters, standing atop a bed of tropical leaves and flowers, giving a natural feeling. The text is ${whiteText}, surrounded by a whole micro biosphere universe of small, colorful insects and tiny birds, with plants and insects crawling on top of the letters. The scene is set against a solid black background, creating a striking contrast. It's a vibrant micro biome.`,
