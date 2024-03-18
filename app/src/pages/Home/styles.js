import styled from '@emotion/styled';
import { Box, Container, Paper } from '@material-ui/core';
import { Colors, Fonts, MOBILE_BREAKPOINT } from '../../styles/global';

export const ImageStyle = styled.img`
  max-width: 100%;
  max-height: 400px;
`;
export const GenerativeImageURLContainer = styled(Container)`
  background-color: rgba(0,0,0,0.7);
  color: white;
  margin: 2em auto;
  padding: 1em;
  width: 80%;
  border-radius: 8px;
  @media (max-width: 600px) {
    width: 95%;
  }
`;
export const ImageURLHeading = styled.p`
  font-family: ${Fonts.headline} !important;
  font-style: normal  !important;
  font-weight: 400 !important;
  font-size: 96px !important;
  line-height: 105px !important;
  text-transform: capitalize !important;

  margin: 0;
  margin-top: 1em;
  color: ${Colors.offblack};

  span {
    font-family: ${Fonts.headline};
    color: ${Colors.lime};
  }

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    max-width: 600px;
    font-size: 58px;
    line-height: 55px;
    margin: 0;
    margin-top: 1em;
  }
  `;
export const ImageContainer = styled(Paper)`
  margin-bottom: 1em;
`;

export const URLExplanation = styled(Box)`
  margin-top: 1em;
  font-size: 0.9em;
`;
