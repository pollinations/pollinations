import styled from "@emotion/styled";
import { Colors, Fonts } from "../config/global";

export const Title = styled.h1`
  font-size: ${(props) => props.fontSize || "8em"};
  color: ${(props) => props.color || Colors.lime};
  font-family: ${Fonts.title};
  letter-spacing: 0.1em;
  line-height: 1em;
  text-align: center;
  ${({ theme }) => theme.breakpoints.down("md")} {
    font-size: ${(props) => props.fontSize || "4em"};
  }
`;

export const Heading = styled.h2`
  font-size: ${(props) => props.fontSize || "1.5em"};
  max-width: ${(props) => props.maxWidth || "750px"};
  color: ${(props) => props.color || Colors.offwhite};
  font-family: ${Fonts.headline};
  font-weight: 500;
  text-align: ${(props) => props.textAlign || "center"};
  justify-content: ${(props) => props.justifyContent || "center"};
  ${({ theme }) => theme.breakpoints.down("md")} {
    font-size: ${(props) => props.fontSize || "1.5em"};
  }
`;

export const Body = styled.p`
  font-size: ${(props) => props.fontSize || "1em"};
  color: ${(props) => props.color || Colors.offwhite};
  font-family: ${Fonts.body};
  text-align: ${(props) => props.textAlign || "left"};
  line-height: 1.5em;
`;
