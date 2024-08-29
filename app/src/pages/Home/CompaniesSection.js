import React from 'react';
import Markdown from 'markdown-to-jsx';
import { Container } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { ImageURLHeading } from './styles';

const useStyles = makeStyles((theme) => ({
    root: {
        maxWidth: 500,
        margin: '0 auto',
        padding: theme.spacing(1),
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    th: {
        padding: theme.spacing(1),
        fontSize: '1.2em',
    },
    td: {
        padding: theme.spacing(0.4),
        fontSize: '1.1em',
    },
}));

const logoPrefix = "minimalist logo";
const imageDimension = 96;
const seedValue = 42; // Define the seed value here

const companies = [
    {
        name: "AWS",
        url: "https://aws.amazon.com/",
        description: "GPU Cloud Credits"
    },
    {
        name: "Google Cloud",
        url: "https://cloud.google.com/",
        description: "GPU Cloud Credits"
    },
    {
        name: "OVH Cloud",
        url: "https://www.ovhcloud.com/",
        description: "GPU Cloud credits."
    },
    {
        name: "NVIDIA Inception",
        url: "https://www.nvidia.com/en-us/deep-learning-ai/startups/",
        description: "AI startup support."
    },
    {
        name: "Azure",
        url: "https://azure.microsoft.com/",
        description: "OpenAI credits"
    },
    {
        name: "Outlier Ventures",
        url: "https://outlierventures.io/",
        description: "Investment"
    },
];

const generateImageUrl = (name, description) => `https://pollinations.ai/p/${encodeURIComponent(`${logoPrefix} ${name} ${description}`)}?width=${imageDimension}&height=${imageDimension}&nologo=true&seed=${seedValue}`;

const markdownContent = `
|  |  |  |
|--------------|-------------|------|
${companies.map(company => `| ![${company.name}](${generateImageUrl(company.name, company.description)}) | [${company.name}](${company.url}) | ${company.description} |`).join('\n')}
`;

const CompaniesSection = () => {
    const classes = useStyles();

    return (
        <Container className={classes.root}>
            <ImageURLHeading>Supported By</ImageURLHeading>
            <Markdown
                options={{
                    overrides: {
                        table: {
                            component: 'table',
                            props: {
                                className: classes.table,
                            },
                        },
                        th: {
                            component: 'th',
                            props: {
                                className: classes.th,
                            },
                        },
                        td: {
                            component: 'td',
                            props: {
                                className: classes.td,
                            },
                        },
                    },
                }}
            >
                {markdownContent}
            </Markdown>
        </Container>
    );
};

export default CompaniesSection;