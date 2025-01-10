import { Fonts } from "./global"
import styled from "@emotion/styled"

export const LinkStyle = styled.a`
  font-family: ${Fonts.body};
  font-style: normal;
  font-weight: 900;
  font-size: 18px;
  line-height: 22px;
  text-decoration-line: underline;
  text-transform: uppercase;
`

export const Container = styled.div`
  width: 100%;
  // max-width: 1440px;
  min-height: 100vh;
`

export const SectionContainer = styled.div`
  width: 100%;
  display: "flex";
  background-color: ${(props) => props.backgroundColor};
`

