import React from 'react';
import { Container, useMediaQuery, Link, Table, TableBody, TableCell, TableRow } from '@material-ui/core';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import { ImageURLHeading } from './styles';
import { Colors } from '../../styles/global';

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
        borderSpacing: '0 8px', // Adds vertical space between rows
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
}));

const logoPrefix = "minimalist  logo";
const imageDimension = 96;
const seedValue = 41 + Math.floor(Math.random() * 3); // Define the seed value here

const projects = [
    {
        name: "SillyTavern",
        url: "https://docs.sillytavern.app/extensions/stable-diffusion/",
        description: "An LLM frontend for power users. Pollinations permits it to generate images."
    },
    {
        name: "Pollinator App",
        url: "https://github.com/g-aggarwal/Pollinator",
        description: "An open-source Android app for text-to-image generation using Pollinations.ai's endpoint.",
        author: "@gaurav_87680"
    },
    {
        name: "Discord Bot",
        url: "https://discord.com/oauth2/authorize?client_id=1123551005993357342",
        description: "A Discord bot that uses Pollinations.ai for generating images based on user prompts.",
        author: "@Zngzy",
        repo: "https://github.com/Zingzy/pollinations.ai-bot"
    },
    {
        name: "Telegram Bot",
        url: "http://t.me/pollinationsbot",
        description: "A Telegram bot that uses Pollinations.ai for generating images based on user prompts.",
        author: "Wong Wei Hao"
    },
    {
        name: "WhatsApp Group",
        url: "https://chat.whatsapp.com/KI37JqT5aYdL9WBYMyyjDV",
        description: "A WhatsApp group for discussing and sharing projects related to Pollinations.ai.",
        author: "@dg_karma"
    },
    {
        name: "Karma.yt",
        url: "https://karma.yt",
        description: "A project that uses Pollinations.ai for generating AI-driven content for Karma.yt.",
        author: "@dg_karma"
    },
    {
        name: "StorySight",
        url: "https://github.com/abiral-manandhar/storySight",
        description: "App aiming to help children with learning disabilities to learn by visualizing abstract concepts. Made using Django and Pollinations.ai. Submitted to: https://devpost.com/software/storysight"
    },
    {
        name: "Anyai",
        url: "#",
        description: "A Discord bot and community that amongst others leverages Pollinations.ai for generating AI-driven content.",
        author: "@meow_18838"
    },
    {
        name: "Python Package",
        url: "https://pypi.org/project/pollinations/",
        description: "A Python package that allows developers to easily integrate Pollinations.ai's image generation capabilities into their projects.",
        author: "@flo.a"
    },
    {
        name: "Websim",
        url: "https://websim.ai/c/bXsmNE96e3op5rtUS",
        description: "A web simulation tool that integrates Pollinations.ai for generating AI-driven content.",
        author: "@thomash_pollinations"
    },
    {
        name: "FlowGPT",
        url: "https://flowgpt.com/p/instant-image-generation-with-chatgpt-and-pollinationsai",
        description: "Generate images on-demand with ChatGPT and Pollinations.AI."
    },
    {
        name: "Toolkitr",
        url: "https://github.com/toolkitr/pollinations.ai",
        description: "Another Python wrapper for Pollinations."
    }
];

const generateImageUrl = (name) => `https://pollinations.ai/p/${encodeURIComponent(`${logoPrefix} ${name}`)}?width=${imageDimension}&height=${imageDimension}&nologo=true&seed=${seedValue}`;

const ProjectsSection = () => {
    const classes = useStyles();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    return (
        <Container className={classes.root}>
            <ImageURLHeading>Integrations</ImageURLHeading>
            <Table className={classes.table}>
                <TableBody>
                    {projects.map((project, index) => (
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
                                    {project.description}
                                </span>
                                {project.repo && renderRepoLink(project.repo)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
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
                fontSize: '1.1em', // Larger text size
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