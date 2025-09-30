import Typography from "@mui/material/Typography";
import Markdown from "markdown-to-jsx";
import { range, zipObj } from "ramda";
import useFetchText from "../hooks/useFetchText";
import useMarkdown from "../hooks/useMarkdown";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import styled from "@emotion/styled";

// replacements allow replacing dynamic content in the markdown
// the syntax is {[key]} which will be matched with the props passed to this object

const MarkDownContent = ({ url, ...replacements }) => {
    const raw = useFetchText(url);
    const { body } = useMarkdown(raw);
    const headersToInclude = range(1, 7);
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

    // header tags
    const tags = headersToInclude.map((i) => `h${i}`);

    // elements to override the header tags with
    const overrideElements = tags.map((tag) => ({ children }) => (
        <Typography
            component="div"
            variant={tag}
            children={children}
            style={{ fontSize: "2em", marginTop: "2em" }}
        />
    ));

    let overrides = zipObj(tags, overrideElements);

    overrides = {
        ...overrides,
        video: ({ src, controls, width, height, children, ...props }) => {
            const style = isDesktop
                ? props.style
                    ? { float: "right", marginLeft: "50px", ...props.style }
                    : { float: "right", marginLeft: "50px" }
                : { display: "block", margin: "auto", ...props.style };

            return (
                <video
                    src={src}
                    controls={controls}
                    width={width}
                    height={height}
                    style={style}
                    {...props}
                >
                    {children}
                </video>
            );
        },
    };

    const contentWithReplacements = applyReplacements(replacements, body);

    return (
        <StyledMarkdownContent>
            <Markdown options={{ overrides }}>
                {contentWithReplacements}
            </Markdown>
        </StyledMarkdownContent>
    );
};

export default MarkDownContent;

// transform all {[key]} strings to the replacements coming from the props
const applyReplacements = (replacements, content) =>
    Object.entries(replacements).reduce(replaceOne, content);

const replaceOne = (content, [key, replacement]) =>
    content.replaceAll(`{${key}}`, replacement);

const StyledMarkdownContent = styled.div`
  ${({ theme }) => theme.breakpoints.down("md")} {
    h1,
    h2,
    h3,
    h4,
    h5,
    h6,
    p,
    ul,
    li {
      text-align: center;
    }
  }
`;
