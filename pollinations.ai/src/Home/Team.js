import { Colors } from "../config/global.js"
import { SectionContainer, SectionSubContainer, SectionHeadlineStyle } from "../components/SectionContainer.js"
import {
  TEAM_SUBTITLE,
  TEAM_TITLE,
  TEAM_1_NAME,
  TEAM_1_FUNCTION,
  TEAM_2_NAME,
  TEAM_2_FUNCTION,
  TEAM_3_NAME,
  TEAM_3_FUNCTION,
  TEAM_4_NAME,
  TEAM_4_FUNCTION,
  TEAM_5_NAME,
  TEAM_5_FUNCTION,
  TEAM_6_NAME,
  TEAM_6_FUNCTION,
  TEAM_1_IMAGE,
  TEAM_2_IMAGE,
  TEAM_3_IMAGE,
  TEAM_4_IMAGE,
  TEAM_5_IMAGE,
  TEAM_6_IMAGE,
} from "../config/copywrite.js"
import TextEmojiText from "../components/TextEmojiText.js"
import Grid from "@mui/material/Grid2"
import SectionTitle from "../components/SectionTitle.js"
import { LLMTextManipulator } from "../components/LLMTextManipulator"
const teamMembers = [
  { name: TEAM_1_NAME, function: TEAM_1_FUNCTION, image: TEAM_1_IMAGE },
  { name: TEAM_2_NAME, function: TEAM_2_FUNCTION, image: TEAM_2_IMAGE },
  { name: TEAM_3_NAME, function: TEAM_3_FUNCTION, image: TEAM_3_IMAGE },
  { name: TEAM_4_NAME, function: TEAM_4_FUNCTION, image: TEAM_4_IMAGE },
  { name: TEAM_5_NAME, function: TEAM_5_FUNCTION, image: TEAM_5_IMAGE },
  { name: TEAM_6_NAME, function: TEAM_6_FUNCTION, image: TEAM_6_IMAGE },

];

const Team = () => {
  return (
    <SectionContainer style={{ backgroundColor: Colors.lime }}>
      <SectionSubContainer>
        <SectionTitle title={TEAM_TITLE} color={Colors.offblack} />
      </SectionSubContainer>
      <SectionSubContainer>
        <SectionSubContainer>
          <SectionHeadlineStyle color={Colors.offblack}>
            <LLMTextManipulator>{TEAM_SUBTITLE}</LLMTextManipulator>
          </SectionHeadlineStyle>
        </SectionSubContainer>
        <Grid container spacing={4} justifyContent="center">
          {teamMembers.map((member, index) => (
            <Grid key={index} size={{ xs: 6, md: 2 }}>
              <Grid
                container
                direction="column"
                alignItems="center"
                sx={{
                  borderRadius: "15px",
                  backgroundColor: "transparent",
                }}
              >
                <img
                  src={process.env.PUBLIC_URL + member.image}
                  alt={member.name}
                  style={{
                    width: "150px",
                    height: "150px",
                    borderRadius: "15%",
                    objectFit: "cover",
                  }}
                />
                <SectionHeadlineStyle color={Colors.offblack}>
                  <LLMTextManipulator>{member.name}</LLMTextManipulator>
                </SectionHeadlineStyle>
                <SectionHeadlineStyle color={Colors.offblack}>
                  <LLMTextManipulator>{member.function}</LLMTextManipulator>
                </SectionHeadlineStyle>
              </Grid>
            </Grid>
          ))}
        </Grid>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Team
