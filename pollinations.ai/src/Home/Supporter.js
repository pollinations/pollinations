import React from "react"
import { Colors } from "../config/global"
import { SectionContainer, SectionSubContainer, SectionBgBox } from "../components/SectionContainer"
import SectionTitle from "../components/SectionTitle"
import TextEmojiText from "../components/TextEmojiText"
import { SUPPORTER_TITLE, SUPPORTER_SUBTITLE, SUPPORTER_LOGO_STYLE } from "../config/copywrite"
import { SUPPORTER_LIST } from "../config/supporterList"
import StyledLink from "../components/StyledLink"
import { useTheme, useMediaQuery } from "@mui/material"
import Grid from "@mui/material/Grid2"

const Supporter = () => {
  const theme = useTheme()
  const isMdUp = useMediaQuery(theme.breakpoints.up("md"))

  const imageDimension = 96
  const seedValue = 41 + Math.floor(Math.random() * 3)

  const generateImageUrl = (name, description) =>
    `https://pollinations.ai/p/${encodeURIComponent(
      `${SUPPORTER_LOGO_STYLE} ${name} ${description}`
    )}?width=${imageDimension * 3}&height=${imageDimension * 3}&nologo=true&seed=${seedValue}`

  return (
    <SectionContainer style={{ backgroundColor: Colors.offblack }}>
      <SectionSubContainer>
        <SectionTitle title={SUPPORTER_TITLE} />
        <TextEmojiText subtitle={SUPPORTER_SUBTITLE} />
      <SectionBgBox style={{ padding: "2em" }}>
        <Grid container spacing={12} >
          {SUPPORTER_LIST.map((company) => (
            <Grid             
              key={company.name}
              size={{ xs: 12, sm: 3 }}
              style={{ textAlign: "center" }}
            >
              <img
                src={generateImageUrl(company.name, company.description)}
                alt={company.name}
                width={imageDimension}
                height={imageDimension}
                style={{ borderRadius: "15px" }}
              />
              <br /><br />
              <StyledLink href={company.url} style={{ color: Colors.lime }}>
                <strong>{company.name}</strong>
              </StyledLink>
              <br />
              {isMdUp && (
                <TextEmojiText subtitle={company.description} color={Colors.offwhite} size="1em" />
              )}
            </Grid>
          ))}
        </Grid>
      </SectionBgBox>
      </SectionSubContainer>

    </SectionContainer>
  )
}

export default Supporter
