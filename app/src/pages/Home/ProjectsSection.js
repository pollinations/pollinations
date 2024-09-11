import React from 'react';
import { Container, useMediaQuery, Link, Table, TableBody, TableCell, TableRow, Typography } from '@material-ui/core';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import { ImageURLHeading } from './styles';
import { Colors } from '../../styles/global';
import Markdown from 'markdown-to-jsx';

const useStyles = makeStyles((theme) => ({
    root: {
        maxWidth: '100%',
        margin: '0 auto',
        padding: theme.spacing(1),
        overflowX: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    table: {
        width: '100%',
        maxWidth: '800px',
        borderCollapse: 'separate',
        borderSpacing: '0 0', // Reduced vertical space between rows
    },
    tableRow: {
        '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)', // Slight highlight on hover
        },
    },
    tableCell: {
        border: 'none', // Removes cell borders
        padding: '8px 16px', // Tighter padding
        fontSize: '1.1em', // Larger text size
        '&:first-child': {
            paddingLeft: 0, // Removes left padding for the first cell
        },
        '&:last-child': {
            paddingRight: 0, // Removes right padding for the last cell
        },
    },
    projectImage: {
        width: '48px', // Smaller image size
        height: '48px',
        objectFit: 'cover',
    },
    sectionHeading: {
        color: Colors.lime,
        marginTop: theme.spacing(4),
        marginBottom: theme.spacing(2),
        textAlign: 'center',
        width: '100%',
    },
    listProjectText: {
        color: Colors.white,
        textAlign: 'center',
        marginTop: theme.spacing(4),
        marginBottom: theme.spacing(4),
        fontSize: '1.1em',
    },
}));

const logoPrefix = "minimalist  logo";
const imageDimension = 96;
const seedValue = 41 + Math.floor(Math.random() * 3); // Define the seed value here

const projects = {
    llmIntegration: [
        {
            name: "SillyTavern",
            url: "https://docs.sillytavern.app/extensions/stable-diffusion/",
            description: "An **LLM frontend** for power users. Pollinations permits it to generate images.",
            repo: "https://github.com/SillyTavern/SillyTavern"
        },
        {
            name: "Qwen-Agent",
            url: "https://github.com/QwenLM/Qwen-Agent",
            description: "A framework for developing agentic LLM applications.",
        },
        {
            name: "DynaSpark AI",
            url: "https://dynaspark.onrender.com",
            description: "An versatile AI assistant with advanced image and text generation capabilities, integrating Pollinations.ai for image generation.",
            author: "Th3-C0der",
            repo: "https://github.com/Th3-C0der"
        },
        {
            name: "FlowGPT",
            url: "https://flowgpt.com/p/instant-image-generation-with-chatgpt-and-pollinationsai",
            description: "Generate images on-demand with **ChatGPT**."
        },
    ],
    socialBots: [
        {
            name: "Discord Bot",
            url: "https://discord.gg/D9xGg8mq3D",
            description: "A **Discord bot** that uses Pollinations.ai for generating images based on user prompts.",
            author: "@Zngzy",
            repo: "https://github.com/Zingzy/pollinations.ai-bot"
        },
        {
            name: "WhatsApp Group",
            url: "https://chat.whatsapp.com/KI37JqT5aYdL9WBYMyyjDV",
            description: "A **WhatsApp group** for that allows you to generate images using Pollinations.ai.",
            author: "@dg_karma"
        },
        {
            name: "Telegram Bot",
            url: "http://t.me/pollinationsbot",
            description: "A **Telegram bot** that uses Pollinations.ai for generating images based on user prompts.",
            author: "Wong Wei Hao"
        },
        {
            name: "Anyai",
            url: "#",
            description: "A **Discord bot** and community that amongst others leverages **Pollinations.ai** for generating AI-driven content.",
            author: "@meow_18838"
        },
        {
            name: "OpenHive",
            url: "https://discord.gg/Zv3SXTF5xy",
            description: "A **Discord server** that bridges the gap between Discord and AI. With Beebot, access dozens of ChatGPT prompts and generate images using Pollinations.ai!",
            author: "@creativegpt"
        },
    ],
    apps: [
        {
            name: "Pollinator Android App",
            url: "https://github.com/g-aggarwal/Pollinator",
            description: "An open-source **Android app** for text-to-image generation using Pollinations.ai's endpoint.",
            author: "@gaurav_87680"
        },
        {
            name: "Own-AI",
            url: "https://own-ai.pages.dev/",
            description: "An AI text-to-image generator powered by Pollinations.ai. Users can describe the images they want, generate them, and share them with the community.",
            author: "Sujal Goswami",
            repo: "https://github.com/sujal-goswami/Own-AI"
        },
        {
            name: "POLLIPAPER",
            url: "https://github.com/Tolerable/POLLIPAPER",
            description: "A dynamic wallpaper application that uses Pollinations AI to create and set unique desktop backgrounds. It offers features like weather-based prompts and customizable settings.",
            author: "@intolerant0ne",
            repo: "https://github.com/Tolerable/"
        },
        {
            name: "StorySight",
            url: "https://github.com/abiral-manandhar/storySight",
            description: "An app aiming to help children with learning disabilities to learn by visualizing abstract concepts. Made using **Django** and **Pollinations.ai**. Submitted to: [Devpost](https://devpost.com/software/storysight)"
        },
        {
            name: "Websim",
            url: "https://websim.ai/c/bXsmNE96e3op5rtUS",
            description: "A web simulation tool that integrates **Pollinations.ai** for generating AI-driven content. *Remix* the app with your own promots.",
            author: "@thomash_pollinations"
        },
    ],
};

const generateImageUrl = (name) => `https://pollinations.ai/p/${encodeURIComponent(`${logoPrefix} ${name}`)}?width=${imageDimension}&height=${imageDimension}&nologo=true&seed=${seedValue}`;

const ProjectsSection = () => {
    const classes = useStyles();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const renderProjects = (projectList) => (
        <Table className={classes.table}>
            <TableBody>
                {projectList.map((project, index) => (
                    <TableRow key={index} className={classes.tableRow}>
                        <TableCell className={classes.tableCell}>
                            {!isMobile && (
                                <img
                                    src={generateImageUrl(project.name)}
                                    alt={project.name}
                                    className={classes.projectImage}
                                />
                            )}
                        </TableCell>
                        <TableCell className={classes.tableCell}>
                            {renderProjectLink(project)}
                            {project.author && (
                                <span style={{ marginLeft: '8px', color: Colors.white, fontSize: '1em' }}>
                                    by {project.author}
                                </span>
                            )}
                        </TableCell>
                        <TableCell className={classes.tableCell}>
                            <span style={{ color: Colors.white, fontSize: '1em' }}>
                                <Markdown>{project.description}</Markdown>
                            </span>
                            {project.repo && renderRepoLink(project.repo)}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );

    return (
        <Container className={classes.root}>
            <ImageURLHeading>Integrations</ImageURLHeading>

            <Typography variant="h5" className={classes.sectionHeading}>Chat Integrations</Typography>
            {renderProjects(projects.llmIntegration)}

            <Typography variant="h5" className={classes.sectionHeading}>Social Bots</Typography>
            {renderProjects(projects.socialBots)}

            <Typography variant="h5" className={classes.sectionHeading}>Mobile & Web Applications</Typography>
            {renderProjects(projects.apps)}

            <Typography className={classes.listProjectText}>
                Have you created a project that integrates Pollinations? We'd love to feature it!<br />
                Get in touch at <Link href="mailto:hello@pollinations.ai" style={{ color: Colors.lime }}>hello@pollinations.ai</Link>.
            </Typography>
        </Container>
    );
};

const renderProjectLink = (project) => {
    return (
        <Link
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
                color: Colors.lime,
                textDecoration: 'none',
                fontWeight: 'bold',
                fontSize: '1em', // Same text size as other text
                '&:hover': {
                    textDecoration: 'underline',
                },
            }}
        >
            {project.name}
        </Link>
    );
};

const renderRepoLink = (repoUrl) => {
    return (
        <Link
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
                color: Colors.lime,
                textDecoration: 'none',
                marginLeft: '8px',
                fontSize: '1.1em', // Larger text size
                '&:hover': {
                    textDecoration: 'underline',
                },
            }}
        >
            GitHub
        </Link>
    );
};

export default ProjectsSection;