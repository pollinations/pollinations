import { Colors } from "../config/global.js"
import AsciiArtGenerator from "../components/AsciiArtGenerator.js"
import { SectionContainer, SectionSubContainer } from "../components/SectionContainer.js"
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
    <SectionContainer style={{ backgroundColor: Colors.offwhite }}>
      <SectionSubContainer>
        <SectionTitle title={TEAM_TITLE} color={Colors.offblack} />
        <TextEmojiText color={Colors.offblack} subtitle={TEAM_SUBTITLE} size="1.8em" />
        <Grid container spacing={4} justifyContent="center">
          {teamMembers.map((member, index) => (
            <Grid key={index} item xs={12} sm={6} md={4} lg={3}>
              <Grid
                container
                direction="column"
                alignItems="center"
                sx={{
                  borderRadius: "15px",
                  backgroundColor: Colors.offwhite,
                  padding: 2,
                }}
              >
                <img
                  src={process.env.PUBLIC_URL + member.image}
                  alt={member.name}
                  style={{
                    width: "180px",
                    height: "180px",
                    borderRadius: "15%",
                    objectFit: "cover",
                    marginBottom: "10px",
                  }}
                />
                <TextEmojiText
                  color={Colors.offblack}
                  subtitle={member.name}
                  size="1.2em"
                />
                <TextEmojiText
                  color={Colors.offblack}
                  subtitle={member.function}
                  size="1em"
                />
              </Grid>
            </Grid>
          ))}
        </Grid>
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Team
