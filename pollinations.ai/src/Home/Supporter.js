import React from "react"
import { Colors, Fonts, SectionBG } from "../config/global"
import {
  SectionContainer,
  SectionSubContainer,
  SectionHeadlineStyle
} from "../components/SectionContainer"
import SectionTitle from "../components/SectionTitle"
import { LLMTextManipulator } from "../components/LLMTextManipulator"
import {
  SUPPORTER_TITLE,
  SUPPORTER_SUBTITLE,
  SUPPORTER_LOGO_STYLE
} from "../config/copywrite"
import {
  rephrase,
  emojify,
  noLink
} from "../config/llmTransforms"
import { SUPPORTER_LIST } from "../config/supporterList"
import StyledLink from "../components/StyledLink"
import { useTheme, useMediaQuery } from "@mui/material"
import Grid from "@mui/material/Grid2"
import SvgArtGenerator from "../components/SvgArtGenerator"
import { trackEvent } from "../config/analytics"

const Supporter = () => {
  const theme = useTheme()
  const isMdUp = useMediaQuery(theme.breakpoints.up("md"))

  const imageDimension = 96
  const seedValue = 41 + Math.floor(Math.random() * 3)

  const generateImageUrl = (name, description) =>
    `https://pollinations.ai/p/${encodeURIComponent(
      `${SUPPORTER_LOGO_STYLE} ${name} ${description}`
    )}?width=${imageDimension * 3}&height=${imageDimension * 3}&nologo=true&seed=${seedValue}`

  // Helper to ensure proper protocol for external links
  const getCompanyLink = (url) => {
    console.log("[getCompanyLink] Raw URL:", url)
    if (!url) {
      console.warn("[getCompanyLink] No URL provided, returning '#'")
      return "#"
    }
    if (url.startsWith("http")) {
      console.log("[getCompanyLink] Protocol included, returning URL as is:", url)
      return url
    } else {
      const correctedUrl = `https://${url}`
      console.warn("[getCompanyLink] Protocol missing, corrected URL:", correctedUrl)
      return correctedUrl
    }
  }

  const handleSupporterClick = (companyName) => {
    trackEvent({
      action: 'click_supporter',
      category: 'supporter',
      value: companyName,
    })
  }

  return (
    <SectionContainer backgroundConfig={SectionBG.supporter}>
      {/* <SvgArtGenerator
        width="1920px"
        height="600px"
      /> */}
      <SectionSubContainer>
        <SectionTitle title={SUPPORTER_TITLE} />
      </SectionSubContainer>
      <SectionSubContainer>
        <SectionHeadlineStyle>
          <LLMTextManipulator text={SUPPORTER_SUBTITLE} transforms={[rephrase, emojify, noLink]} />
        </SectionHeadlineStyle>
      </SectionSubContainer>
      <SectionSubContainer>
        <Grid container spacing={4} mb={8}>
          {SUPPORTER_LIST.map((company) => (
            <Grid key={company.name} size={{ xs: 6, sm: 3 }} style={{ textAlign: "center" }}>
              <img
                src={generateImageUrl(company.name, company.description, SUPPORTER_LOGO_STYLE)}
                alt={company.name}
                width={imageDimension}
                height={imageDimension}
                style={{ borderRadius: "15px" }}
              />
              <br />
              <br />
              <StyledLink
                isExternal
                href={getCompanyLink(company.url)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: Colors.lime, fontFamily: Fonts.parameter, fontSize: "1.3em" }}
                onClick={() => handleSupporterClick(company.name)}
              >
                <strong>{company.name}</strong>
              </StyledLink>
              <br />
              {isMdUp && (
                <span
                  style={{ color: Colors.offwhite, fontSize: "1em", fontFamily: Fonts.parameter }}
                >
                  <LLMTextManipulator text={company.description} transforms={[rephrase, emojify, noLink]} />
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
