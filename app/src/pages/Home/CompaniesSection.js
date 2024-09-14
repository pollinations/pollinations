import React, { useEffect, useState } from "react"
import { Container } from "@material-ui/core"
import { makeStyles } from "@material-ui/core/styles"
import { ImageURLHeading } from "./styles"
import { Colors, Fonts } from "../../styles/global"

const CompaniesSection = () => {
  const [screenWidth, setScreenWidth] = useState(window.innerWidth)

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth)
    window.addEventListener("resize", handleResize)
    console.log("Screen width:", screenWidth)
    return () => window.removeEventListener("resize", handleResize)
  }, [screenWidth])

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
      margin: "0",
    },
    td: {
      padding: theme.spacing(1),
      fontSize: "1.1em",
    },
    link: {
      fontFamily: Fonts.body,
      fontWeight: 500,
      fontSize: "18px",
      textDecoration: "underline",
      textTransform: "uppercase",
      color: Colors.offwhite,
    },
  }))

  const classes = useStyles()

  const logoPrefix = "minimalist logo"
  const imageDimension = 96
  const seedValue = 41 + Math.floor(Math.random() * 3)

  const companies = [
    { name: "AWS Activate", url: "https://aws.amazon.com/", description: "GPU Cloud Credits" },
    { name: "Google Cloud for Startups", url: "https://cloud.google.com/", description: "GPU Cloud Credits" },
    { name: "OVH Cloud", url: "https://www.ovhcloud.com/", description: "GPU Cloud credits" },
    { name: "NVIDIA Inception", url: "https://www.nvidia.com/en-us/deep-learning-ai/startups/", description: "AI startup support" },
    { name: "Azure (MS for Startups)", url: "https://azure.microsoft.com/", description: "OpenAI credits" },
    { name: "Outlier Ventures", url: "https://outlierventures.io/", description: "Startup Accelerator" },
  ]

  const generateImageUrl = (name, description) =>
    `https://pollinations.ai/p/${encodeURIComponent(`${logoPrefix} ${name} ${description}`)}?width=${imageDimension * 3}&height=${imageDimension * 3}&nologo=true&seed=${seedValue}`

  const tableRows = companies.reduce((rows, company, index) => {
    if (index % 2 === 0) rows.push([])
    rows[rows.length - 1].push(
      <>
        <td key={company.name} className={classes.td}>
          <img src={generateImageUrl(company.name, company.description)} alt={company.name} style={{ width: `${imageDimension}px`, height: `${imageDimension}px` }} />
        </td>
        <td>
          <a href={company.url} className={classes.link}>{company.name}</a>
          <br />
          {company.description}
        </td>
      </>
    )
    return rows
  }, []).map((row, index) => <tr key={index}>{row}</tr>)

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
