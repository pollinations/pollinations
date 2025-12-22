import React, { useState } from "react";
import { Link, Box, useMediaQuery } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { useTheme } from "@mui/material/styles";
import { ReactSVG } from "react-svg";
import { Colors, Fonts } from "../../config/global";
import { LLMTextManipulator } from "../LLMTextManipulator";
import useRandomSeed from "../../hooks/useRandomSeed";
import { usePollinationsImage } from "@pollinations/react";
import { PROJECT_LOGO_STYLE } from "../../config/copywrite";
import { shortTechnical } from "../../config/llmTransforms";
import { ICONS } from "../../icons/icons";
import { trackEvent } from "../../config/analytics";
import { SectionSubContainer } from "../SectionContainer";
import { UI_ASSETS_API_KEY } from "../../utils/enterApi";

/**
 * Renders the list of projects for the selected category
 * @param {Object} props - Component props
 * @param {Array} props.projectList - List of projects to render
 * @param {Object} props.classes - CSS classes
 */
const ProjectsRender = ({ projectList, classes }) => {
    const theme = useTheme();
    const PROJECT_LOGO_SIZE = useMediaQuery(theme.breakpoints.down("md"))
        ? 80
        : 96;
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

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
                                    alignItems: isMobile ? "center" : "flex-start",
                                    width: "100%",
                                }}
                                className={classes.gridItem}
                            >
                                {isMobile
                                    ? // Mobile layout
                                      <Grid
                                          container
                                          direction="column"
                                          width="100%"
                                      >
                                          {/* First row: Image and title side by side */}
                                          <Grid
                                              container
                                              direction="row"
                                              alignItems="center"
                                              justifyContent="flex-start"
                                              width="100%"
                                              mt={5}
                                          >
                                              {/* Image */}
                                              <Grid
                                                  size={3}
                                                  style={{
                                                      textAlign: "left",
                                                  }}
                                              >
                                                  <ProjectImage
                                                      name={project.name}
                                                      description={
                                                          project.description
                                                      }
                                                      PROJECT_LOGO_SIZE={
                                                          PROJECT_LOGO_SIZE
                                                      }
                                                      url={project.url}
                                                  />
                                              </Grid>
                                              {/* Title and author */}
                                              <Grid size={9} sx={{ pl: 2 }}>
                                                  <Box>
                                                      {renderProjectLink(
                                                          project,
                                                      )}
                                                      {project.author && (
                                                          <div
                                                              style={{
                                                                  marginTop:
                                                                      "0.5em",
                                                                  color: Colors.offwhite,
                                                                  fontSize:
                                                                      "1em",
                                                                  fontFamily:
                                                                      Fonts.parameter,
                                                              }}
                                                          >
                                                              by{" "}
                                                              {project.author.startsWith(
                                                                  "@",
                                                              )
                                                                  ? <Link
                                                                        href={`https://discord.com/users/${project.author.substring(1)}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{
                                                                            color: Colors.lime,
                                                                        }}
                                                                        onClick={() =>
                                                                            trackEvent(
                                                                                {
                                                                                    action: "click_project_author",
                                                                                    category:
                                                                                        "project",
                                                                                    value: project.author,
                                                                                },
                                                                            )
                                                                        }
                                                                    >
                                                                        {
                                                                            project.author
                                                                        }
                                                                    </Link>
                                                                  : project.author.startsWith(
                                                                          "[",
                                                                      ) &&
                                                                      project.author.includes(
                                                                          "](",
                                                                      )
                                                                    ? (() => {
                                                                          const match =
                                                                              project.author.match(
                                                                                  /^\[(.*?)\]\((.*?)\)$/,
                                                                              );
                                                                          if (
                                                                              match
                                                                          ) {
                                                                              const displayName =
                                                                                  match[1];
                                                                              const userUrl =
                                                                                  match[2];
                                                                              return (
                                                                                  <Link
                                                                                      href={
                                                                                          userUrl
                                                                                      }
                                                                                      target="_blank"
                                                                                      rel="noopener noreferrer"
                                                                                      style={{
                                                                                          color: Colors.lime,
                                                                                      }}
                                                                                      onClick={() =>
                                                                                          trackEvent(
                                                                                              {
                                                                                                  action: "click_project_author",
                                                                                                  category:
                                                                                                      "project",
                                                                                                  value: displayName,
                                                                                              },
                                                                                          )
                                                                                      }
                                                                                  >
                                                                                      {
                                                                                          displayName
                                                                                      }
                                                                                  </Link>
                                                                              );
                                                                          }
                                                                          return project.author;
                                                                      })()
                                                                    : project.author.includes(
                                                                            "http",
                                                                        )
                                                                      ? <Link
                                                                            href={
                                                                                project.author
                                                                            }
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            style={{
                                                                                color: Colors.lime,
                                                                            }}
                                                                        >
                                                                            {project.author
                                                                                .split(
                                                                                    "/",
                                                                                )
                                                                                .pop()}
                                                                        </Link>
                                                                      : project.author}
                                                          </div>
                                                      )}
                                                  </Box>
                                              </Grid>
                                          </Grid>

                                          {/* Second row: Description */}
                                          <Grid
                                              container
                                              direction="row"
                                              width="100%"
                                              sx={{ mt: 2 }}
                                          >
                                              <Grid
                                                  size={12}
                                                  style={{
                                                      textAlign: "left",
                                                  }}
                                              >
                                                  <span
                                                      style={{
                                                          color: Colors.offwhite,
                                                          fontSize: "1em",
                                                          fontFamily:
                                                              Fonts.parameter,
                                                      }}
                                                  >
                                                      <LLMTextManipulator
                                                          text={
                                                              project.description
                                                          }
                                                          transforms={[
                                                              shortTechnical,
                                                          ]}
                                                      />
                                                  </span>
                                                  {project.repo &&
                                                      renderRepoLink(
                                                          project.repo,
                                                          project.stars,
                                                      )}
                                              </Grid>
                                          </Grid>
                                      </Grid>
                                    : // Desktop layout (unchanged)
                                      <>
                                          <Grid
                                              size={{ xs: 4, md: 2 }}
                                              style={{ textAlign: "center" }}
                                          >
                                              <ProjectImage
                                                  name={project.name}
                                                  description={
                                                      project.description
                                                  }
                                                  PROJECT_LOGO_SIZE={
                                                      PROJECT_LOGO_SIZE
                                                  }
                                                  url={project.url}
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
                                                  marginBottom={{
                                                      xs: "0.5em",
                                                      md: "0em",
                                                  }}
                                                  style={{
                                                      textAlign: "left",
                                                  }}
                                              >
                                                  <Box
                                                      style={{
                                                          maxWidth: "90%",
                                                      }}
                                                  >
                                                      {renderProjectLink(
                                                          project,
                                                      )}
                                                      {project.author && (
                                                          <div
                                                              style={{
                                                                  marginTop:
                                                                      "0.5em",
                                                                  color: Colors.offwhite,
                                                                  fontSize:
                                                                      "1em",
                                                                  fontFamily:
                                                                      Fonts.parameter,
                                                              }}
                                                          >
                                                              by{" "}
                                                              {project.author.startsWith(
                                                                  "@",
                                                              )
                                                                  ? <Link
                                                                        href={`https://discord.com/users/${project.author.substring(1)}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{
                                                                            color: Colors.lime,
                                                                        }}
                                                                        onClick={() =>
                                                                            trackEvent(
                                                                                {
                                                                                    action: "click_project_author",
                                                                                    category:
                                                                                        "project",
                                                                                    value: project.author,
                                                                                },
                                                                            )
                                                                        }
                                                                    >
                                                                        {
                                                                            project.author
                                                                        }
                                                                    </Link>
                                                                  : project.author.startsWith(
                                                                          "[",
                                                                      ) &&
                                                                      project.author.includes(
                                                                          "](",
                                                                      )
                                                                    ? (() => {
                                                                          const match =
                                                                              project.author.match(
                                                                                  /^\[(.*?)\]\((.*?)\)$/,
                                                                              );
                                                                          if (
                                                                              match
                                                                          ) {
                                                                              const displayName =
                                                                                  match[1];
                                                                              const userUrl =
                                                                                  match[2];
                                                                              return (
                                                                                  <Link
                                                                                      href={
                                                                                          userUrl
                                                                                      }
                                                                                      target="_blank"
                                                                                      rel="noopener noreferrer"
                                                                                      style={{
                                                                                          color: Colors.lime,
                                                                                      }}
                                                                                      onClick={() =>
                                                                                          trackEvent(
                                                                                              {
                                                                                                  action: "click_project_author",
                                                                                                  category:
                                                                                                      "project",
                                                                                                  value: displayName,
                                                                                              },
                                                                                          )
                                                                                      }
                                                                                  >
                                                                                      {
                                                                                          displayName
                                                                                      }
                                                                                  </Link>
                                                                              );
                                                                          }
                                                                          return project.author;
                                                                      })()
                                                                    : project.author.includes(
                                                                            "http",
                                                                        )
                                                                      ? <Link
                                                                            href={
                                                                                project.author
                                                                            }
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            style={{
                                                                                color: Colors.lime,
                                                                            }}
                                                                        >
                                                                            {project.author
                                                                                .split(
                                                                                    "/",
                                                                                )
                                                                                .pop()}
                                                                        </Link>
                                                                      : project.author}
                                                          </div>
                                                      )}
                                                  </Box>
                                              </Grid>

                                              <Grid
                                                  size={{ xs: 12, md: 8 }}
                                                  style={{
                                                      textAlign: "left",
                                                  }}
                                              >
                                                  <span
                                                      style={{
                                                          color: Colors.offwhite,
                                                          fontSize: "1em",
                                                          fontFamily:
                                                              Fonts.parameter,
                                                      }}
                                                  >
                                                      <LLMTextManipulator
                                                          text={
                                                              project.description
                                                          }
                                                          transforms={[
                                                              shortTechnical,
                                                          ]}
                                                      />
                                                  </span>
                                                  {project.repo &&
                                                      renderRepoLink(
                                                          project.repo,
                                                          project.stars,
                                                      )}
                                              </Grid>
                                          </Grid>
                                      </>}
                            </Grid>
                        </SectionSubContainer>
                    </React.Fragment>
                ))}
            </Grid>
        </>
    );
};

const renderProjectLink = (project) => {
    const handleProjectLinkClick = () => {
        trackEvent({
            action: "click_project_title",
            category: "project",
            value: project.name,
        });
    };

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
            {project.isNew ? `🆕 ${project.name}` : project.name}
        </Link>
    );
};

const renderRepoLink = (repoUrl, stars) => {
    const handleRepoLinkClick = () => {
        trackEvent({
            action: "click_project_repo",
            category: "project",
            value: repoUrl,
        });
    };

    // Format star count for display
    const formatStarCount = (count) => {
        if (!count) return null;

        if (count < 1000) {
            return count.toString();
        } else {
            return (count / 1000).toFixed(1).replace(/\.0$/, "") + "k";
        }
    };

    const formattedStars = formatStarCount(stars);

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
                    svg.setAttribute("fill", Colors.lime);
                    svg.setAttribute(
                        "style",
                        "margin-right: 8px; background: transparent; vertical-align: middle;",
                    );
                    svg.setAttribute("width", "18");
                    svg.setAttribute("height", "18");
                }}
            />
            <span
                style={{
                    display: "flex",
                    alignItems: "center",
                    verticalAlign: "middle",
                }}
            >
                GITHUB
                {formattedStars && (
                    <span
                        style={{
                            marginLeft: "8px",
                            backgroundColor: "rgba(255, 255, 255, 0.15)",
                            padding: "0px 6px",
                            borderRadius: "4px",
                            fontSize: "0.85em",
                            display: "flex",
                            alignItems: "center",
                        }}
                    >
                        ⭐ {formattedStars}
                    </span>
                )}
            </span>
        </Link>
    );
};

const ProjectImage = ({ name, PROJECT_LOGO_SIZE, description, url }) => {
    const seed = useRandomSeed();
    const [isHovered, setIsHovered] = useState(false);
    const prompt = `${PROJECT_LOGO_STYLE} ${name} ${description}`;
    const imageUrl = usePollinationsImage(prompt, {
        width: PROJECT_LOGO_SIZE * 4,
        height: PROJECT_LOGO_SIZE * 4,
        nologo: true,
        seed,
        apiKey: UI_ASSETS_API_KEY,
    });

    const handleImageClick = () => {
        trackEvent({
            action: "click_project_image",
            category: "project",
            value: name,
        });
    };

    const imageStyle = {
        width: PROJECT_LOGO_SIZE,
        height: PROJECT_LOGO_SIZE,
        borderRadius: "1em",
        transition: "transform 0.2s ease-in-out",
        cursor: "pointer",
        transform: isHovered ? "scale(0.95)" : "scale(1)",
    };

    return (
        <Link
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleImageClick}
        >
            <img
                src={imageUrl}
                alt={name}
                style={imageStyle}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            />
        </Link>
    );
};

export default ProjectsRender;
