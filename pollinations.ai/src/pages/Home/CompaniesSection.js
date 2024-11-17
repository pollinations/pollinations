import React, { useEffect, useState } from "react"
import { Container, Box } from "@material-ui/core"
import { makeStyles } from "@material-ui/core/styles"
import { ImageURLHeading } from "./ImageHeading"
import { Colors, Fonts } from "../../styles/global"
import { GenerativeImageURLContainer } from "./ImageHeading"
import useIsMobile from "../../hooks/useIsMobile" // Import the new hook

const CompaniesSection = () => {
  const [screenWidth, setScreenWidth] = useState(window.innerWidth)
  const isMobile = useIsMobile() // Use the new hook

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth)
    window.addEventListener("resize", handleResize)
    console.log("Screen width:", screenWidth)
    return () => window.removeEventListener("resize", handleResize)
  }, [screenWidth])

  const useStyles = makeStyles((theme) => ({
    root: {
      width: "100%",
      padding: theme.spacing(1),
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    },
    table: {
      width: "100%",
      maxWidth: "100vw",
      borderCollapse: "collapse",
    },
    td: {
      padding: theme.spacing(1),
      fontSize: "1em",
      textAlign: "center",
      verticalAlign: "top",
    },
    link: {
      fontFamily: Fonts.body,
      fontStyle: "normal",
      fontWeight: "500",
      fontSize: "1.1em",
      lineHeight: "22px",
      textDecoration: "underline",
      textTransform: "uppercase",
      color: Colors.lime,
    },
  }))

  const classes = useStyles()

  const logoPrefix = "minimalist logo on black background"
  const imageDimension = 96
  const seedValue = 41 + Math.floor(Math.random() * 3)

  const companies = [
    {
      name: "LLMPlayground.net",
      url: "https://llmplayground.net/",
      description: "Hosting Custom Flux Models",
    },
    { name: "Karma.YT", url: "https://karma.yt", description: "Social media integrations" },
    { name: "AWS Activate", url: "https://aws.amazon.com/", description: "GPU Cloud Credits" },
    {
      name: "Google Cloud for Startups",
      url: "https://cloud.google.com/",
      description: "GPU Cloud Credits",
    },
    { name: "OVH Cloud", url: "https://www.ovhcloud.com/", description: "GPU Cloud credits" },
    {
      name: "NVIDIA Inception",
      url: "https://www.nvidia.com/en-us/deep-learning-ai/startups/",
      description: "AI startup support",
    },
    {
      name: "Azure (MS for Startups)",
      url: "https://azure.microsoft.com/",
      description: "OpenAI credits",
    },
    {
      name: "Outlier Ventures",
      url: "https://outlierventures.io/",
      description: "Startup Accelerator",
    },
  ]

  const generateImageUrl = (name, description) =>
    `https://pollinations.ai/p/${encodeURIComponent(
      `${logoPrefix} ${name} ${description}`
    )}?width=${imageDimension * 3}&height=${imageDimension * 3}&nologo=true&seed=${seedValue}`

  const tableRows = companies
    .reduce((rows, company, index) => {
      if (index % 2 === 0) rows.push([])
      rows[rows.length - 1].push(
        <td key={company.name} className={classes.td}>
          <img
            src={generateImageUrl(company.name, company.description)}
            alt={company.name}
            style={{ width: `${imageDimension}px`, height: `${imageDimension}px` }}
          />
          <br />
          <a href={company.url} className={classes.link}>
            <strong>{company.name}</strong>
          </a>
          <br />
          {!isMobile && company.description}
        </td>
      )
      return rows
    }, [])
    .map((row, index) => <tr key={index}>{row}</tr>)

  return (
    <GenerativeImageURLContainer>
      <GenerativeImageURLContainer style={{ marginTop: "2em" }}>
        <ImageURLHeading width={isMobile ? 400 : 700} height={isMobile ? 150 : 200}>
          Supported By
        </ImageURLHeading>
      </GenerativeImageURLContainer>
      <table className={classes.table} style={{ marginBottom: "6em" }}>
        <tbody>{tableRows}</tbody>
      </table>
    </GenerativeImageURLContainer>
  )
}

export default CompaniesSection