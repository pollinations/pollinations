import styled from "@emotion/styled";
import { Colors, Fonts } from "../config/global";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

export const SectionContainer = styled.div`
  width: 100%;
  display: flex;
  /*
    We'll handle both color and image. If "gradient" is true, we overlay it only if an image is present.
    We'll read from props.backgroundConfig — which includes {color, image, gradient}.
  */
  background-color: ${(props) =>
      props.backgroundConfig?.color
          ? props.backgroundConfig.color
          : "transparent"};

  background-image: ${(props) => {
      const { image, gradient } = props.backgroundConfig || {};
      if (!image) return "none";
      if (gradient) {
          return `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.9)), url(${image})`;
      }
      return `url(${image})`;
  }};

  background-size: cover;
  background-position: center center;
  background-repeat: repeat;
  margin: 0em auto;
  flex-direction: column;
  align-items: center;
  padding: ${(props) => props.padding || "1em"};
    ${({ theme }) => theme.breakpoints.down("md")} {
    padding: 1em 1em;
  }
  z-index: ${(props) => props.zIndex || "-1"};
`;

export const SectionSubContainer = styled.div`
  display: flex;
  background-color: ${(props) => props.backgroundColor || "transparent"};
  flex-direction: ${(props) => props.flexDirection || "column"};
  align-items: ${(props) => props.alignItems || "center"};
  margin: 0;
  width: 100%;
  max-width: 1000px;
  padding-bottom: ${(props) => props.paddingBottom || "1em"};
  padding-top: 2em;
  justify-content: center;
  z-index: ${(props) => props.zIndex || "1"};
`;
export const SectionMainContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2em;
  width: 100%;
  background-color: ${Colors.offblack};
  border-radius: 0em;
`;
export const SectionTitleStyle = styled.div`
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

export const SectionHeadlineStyle = styled.div`
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
