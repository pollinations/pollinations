import styled from '@emotion/styled';
import { Box, Container, Paper } from '@material-ui/core';
import { Colors, Fonts, MOBILE_BREAKPOINT } from '../../styles/global';

export const ImageStyle = styled.img`
  width: 100%;
  height: auto;
  max-width: 640px;
  max-height: 640px;
`;

export const GenerativeImageURLContainer = styled(Container)`
  color: ${Colors.offwhite};
  // background-color: transparent;
  margin: 0em;
  padding: 0em;
  max-width: 960px;
  border-radius: 0px;
    width: 90%;
`;
export const ImageURLHeading = styled.p`
  font-family: ${Fonts.headline} !important;
  font-style: normal  !important;
  font-size: 100px !important;
  text-align: center;
  margin: 0;
  margin-top: 60px;
  margin-bottom: 60px;
  text-transform: capitalize !important;
  color: ${Colors.offwhite};

  span {
    font-family: ${Fonts.headline};
    color: ${Colors.lime};
  }

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    font-size: 58px;
    line-height: 100px;
    margin: 30px auto;
  }
  `;
export const ImageContainer = styled(Paper)`
  margin: 0;
  display: flex;
  @media (max-width: ${MOBILE_BREAKPOINT}) {
    height: auto;
    margin-bottom: 0px;
  }
`;

export const URLExplanation = styled(Box)`
  margin: 0em;
  font-size: 0.9em;
`;
