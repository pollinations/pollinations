import React, { useEffect, useState } from "react"
import { Container, useMediaQuery } from "@material-ui/core"
import { makeStyles, useTheme } from "@material-ui/core/styles"
import { ImageURLHeading } from "./styles"
import { MOBILE_BREAKPOINT, Colors, Fonts } from "../../styles/global"

const CompaniesSection = () => {
  const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT})`)
  const [screenWidth, setScreenWidth] = useState(window.innerWidth)

  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth)
    }

    window.addEventListener("resize", handleResize)
    console.log("isMobile status:", isMobile, "Screen width:", screenWidth)

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [isMobile, screenWidth])

  const useStyles = makeStyles((theme) => ({
    root: {
      maxWidth: "800px", 
      padding: theme.spacing(1),
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    },
    table: {
      maxWidth: "800px",
      borderCollapse: "collapse",
      marginBottom: "5em",
      margin: isMobile ? "0 auto" : "0",
    },
    th: {
      padding: theme.spacing(0),
      fontSize: "1.2em",
    },
    td: {
      padding: theme.spacing(1), 
      fontSize: "1.1em",
    },
    link: {
      fontFamily: Fonts.body,
      fontStyle: "normal",
      fontWeight: 500,
      fontSize: "18px",
      lineHeight: "22px",
      textDecorationLine: "underline",
      textTransform: "uppercase",
      color: Colors.offwhite,
    },
  }))

  const classes = useStyles()

  const logoPrefix = "minimalist logo"
  const imageDimension = 96
  const seedValue = 41 + Math.floor(Math.random() * 3) 

  const companies = [
    {
      name: "AWS Activate",
      url: "https://aws.amazon.com/",
      description: "GPU Cloud Credits",
    },
    {
      name: "Google Cloud for Startups",
      url: "https://cloud.google.com/",
      description: "GPU Cloud Credits",
    },
    {
      name: "OVH Cloud",
      url: "https://www.ovhcloud.com/",
      description: "GPU Cloud credits",
    },
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
      description: "Accelerator",
    },
  ]

  const generateImageUrl = (name, description) =>
    `https://pollinations.ai/p/${encodeURIComponent(
      `${logoPrefix} ${name} ${description}`
    )}?width=${imageDimension}&height=${imageDimension}&nologo=true&seed=${seedValue}`

  const tableRows = []
  for (let i = 0; i < companies.length; i += isMobile ? 1 : 2) {
    tableRows.push(
      <tr key={i}>
        <td className={classes.td}>
          <img src={generateImageUrl(companies[i].name, companies[i].description)} alt={companies[i].name} />
        </td>
        <td className={classes.td}>
          <a href={companies[i].url} className={classes.link}>
            {companies[i].name}
          </a>
          <br />
          {companies[i].description}
        </td>
        {!isMobile && companies[i + 1] && (
          <>
            <td className={classes.td}>
              <img src={generateImageUrl(companies[i + 1].name, companies[i + 1].description)} alt={companies[i + 1].name} />
            </td>
            <td className={classes.td}>
              <a href={companies[i + 1].url} className={classes.link}>
                {companies[i + 1].name}
              </a>
              <br />
              {companies[i + 1].description}
            </td>
          </>
        )}
      </tr>
    )
  }

  return (
    <Container className={classes.root}>
      <ImageURLHeading>Supported By</ImageURLHeading>
      <table className={classes.table}>
        <tbody>{tableRows}</tbody>
      </table>
    </Container>
  )
}

export default CompaniesSection
