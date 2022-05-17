// This will currenntly only be used as collaboration exposé page, but could be as easily be used as generic blog post, hence the name BlogPostPage
import { Link, useLocation, useParams } from "react-router-dom"
import { EXPOS } from "../assets"
import MarkDownContent from "../components/molecules/MarkDownContent"
import { content } from "./styles/content"
import styled from "@emotion/styled"
import Icon from "../components/atoms/Icon"
import { ICONS } from "../assets/icons"
import { COLORS } from "../_globalConfig/colors"

const ExpoItemPage = () => {
  const { expoId } = useParams()
  const url = EXPOS[expoId]
  const { pathname } = useLocation()
  const parentPath = pathname.replace("/" + expoId, "")

  return (
    <Wrapper>
      <Link to={parentPath} style={{ textDecoration: "none" }}>
        <Icon path={ICONS.chevronLeft} color={COLORS.font.default} /> <span>BACK</span>
      </Link>
      <MarkDownContent url={url} />
    </Wrapper>
  )
}

export default ExpoItemPage

const Wrapper = styled.div`
  ${content}
`
