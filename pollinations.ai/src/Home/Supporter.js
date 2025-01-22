import React from "react"
import { Colors, Fonts } from "../config/global"
import { SectionContainer, SectionSubContainer, SectionHeadlineStyle } from "../components/SectionContainer"
import SectionTitle from "../components/SectionTitle"
import { LLMTextManipulator } from "../components/LLMTextManipulator"
import {
  SUPPORTER_TITLE,
  SUPPORTER_SUBTITLE,
  SUPPORTER_LOGO_STYLE,
  SUPPORTER_DESCRIPTION_STYLE,
} from "../config/copywrite"
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
      </SectionSubContainer>
      <SectionSubContainer>
        <SectionHeadlineStyle>
          <LLMTextManipulator>{SUPPORTER_SUBTITLE}</LLMTextManipulator>
        </SectionHeadlineStyle>
      </SectionSubContainer>
      <SectionSubContainer>
        <Grid container spacing={4}>
          {SUPPORTER_LIST.map((company) => (
            <Grid key={company.name} size={{ xs: 6, sm: 3 }} style={{ textAlign: "center" }}>
              <img
                src={generateImageUrl(company.name, company.description)}
                alt={company.name}
                width={imageDimension}
                height={imageDimension}
                style={{ borderRadius: "15px" }}
              />
              <br />
              <br />
              <StyledLink href={company.url} style={{ color: Colors.lime, fontFamily: Fonts.parameter }}>
                <strong>{company.name}</strong>
              </StyledLink>
              <br />
              {isMdUp && (
                <span style={{ color: Colors.offwhite, fontSize: "1em", fontFamily: Fonts.parameter }}>
                  <LLMTextManipulator>
                    {SUPPORTER_DESCRIPTION_STYLE + company.description}
                  </LLMTextManipulator>
                </span>
              )}
            </Grid>
          ))}
        </Grid>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Supporter