import styled from "@emotion/styled"
import { Colors, Fonts } from "../config/global"
import { useTheme } from "@mui/material/styles"
import useMediaQuery from "@mui/material/useMediaQuery"

export const SectionContainer = styled.div`
  width: 100%;
  display: flex;
  background-color: ${(props) => props.backgroundColor || "transparent"};
  margin: 0em auto;
  flex-direction: column;
  align-items: center;
  padding: 1em;
`

export const SectionSubContainer = styled.div`
  display: flex;
  background-color: ${(props) => props.backgroundColor || "transparent"};
  flex-direction: ${(props) => props.flexDirection || "column"};
  align-items: ${(props) => props.alignItems || "center"};
  max-width: 1000px;
  margin: 0;
  width: 100%;
  padding-bottom: ${(props) => props.paddingBottom || "3em"};
  padding-top: 0em;
  justify-content: center;
  align-items: center;
`

export const SectionBgBox = styled.div`
  background-color: ${(props) => props.backgroundColor || `${Colors.offblack2}70`};
  border-radius: 0px;
  max-width: 1000px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1em;

  /* Use Material-UI's theme breakpoints for responsive design */
  ${({ theme }) => theme.breakpoints.down('md')} {
    background-color: transparent;
  }
`

export const SectionTitleStyle = styled.div`
  font-size: ${(props) => props.fontSize || "8em"};
  color: ${(props) => props.color || Colors.lime};
  font-family: ${Fonts.title};
  font-weight: bold;
  letter-spacing: 0.1em;
  line-height: 1em;
  text-align: center;
  margin-top: 0.5em;
  ${({ theme }) => theme.breakpoints.down('md')} {
    font-size: ${(props) => props.fontSize || "3.5em"};
  }
`

export const SectionHeadlineStyle = styled.div`
  font-size: ${(props) => props.fontSize || "1.5em"};
  color: ${(props) => props.color || Colors.offwhite};
  font-family: ${Fonts.headline};
  text-align: ${(props) => props.textAlign || "center"};
  ${({ theme }) => theme.breakpoints.down('md')} {
    font-size: ${(props) => props.fontSize || "1.5em"};
  }
`
