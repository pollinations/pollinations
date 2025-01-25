import { Colors, SectionBG } from "../config/global.js"
import {
  SectionContainer,
  SectionSubContainer,
  SectionHeadlineStyle,
} from "../components/SectionContainer.js"
import { TEAM_MEMBERS, TEAM_TITLE } from "../config/copywrite.js"
import Grid from "@mui/material/Grid2"
import SectionTitle from "../components/SectionTitle.js"
import { LLMTextManipulator } from "../components/LLMTextManipulator"
import { Box } from "@mui/material"

const Team = () => {
  return (
    <SectionContainer backgroundConfig={SectionBG.team}>
      <SectionSubContainer>
        <SectionTitle title={TEAM_TITLE} color={Colors.lime} />
      </SectionSubContainer>
      <SectionSubContainer>
        {TEAM_MEMBERS.map((member, index) => (
          <SectionSubContainer key={index}>
            <SectionHeadlineStyle color={Colors.offwhite}>
              {member.name}
            </SectionHeadlineStyle>
            <p>{member.function}</p>
            <img src={process.env.PUBLIC_URL + member.image} alt={member.name} />
          </SectionSubContainer>
        ))}
      </SectionSubContainer>
    </SectionContainer>
  )
}

export default Team
