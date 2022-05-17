import styled from "@emotion/styled/"
import { Link, useLocation } from "react-router-dom"
import { EXPOS } from "../assets"
import useFetchText from "../hooks/useFetchText"
import useMarkdown from "../hooks/useMarkdown"
import Icon from "./atoms/Icon"
import { ICONS } from "../assets/icons"
import { COLORS } from "../_globalConfig/colors"
const ExpoTeaser = ({ expoId }) => {
  const raw = useFetchText(EXPOS[expoId])
  const { meta, body } = useMarkdown(raw)
  const { title, subtitle, teaser } = meta
  const { pathname } = useLocation()
  return (
    <Wrapper>
      <Link to={`${pathname}/${expoId}`}>
        <h2>{title}</h2>
        <h3>{subtitle}</h3>
        <TeaserText>{teaser}</TeaserText>
        <Arrow className="arrow" path={ICONS.chevronRight} color={COLORS.font.default} />
      </Link>
    </Wrapper>
  )
}
export default ExpoTeaser

const Arrow = styled(Icon)`
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  visibility: hidden;
`

const Wrapper = styled.div`
  cursor: pointer;
  position: relative;
  margin-bottom: 2em;
  opacity: 0.5;
  transition: opacity 0.5s ease-out;

  a {
    text-decoration: none;
  }
  :hover {
    opacity: 1;
    .arrow {
      visibility: visible;
    }
  }
`

const TeaserText = styled.p``
