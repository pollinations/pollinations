import styled from '@emotion/styled';
import { Box, Container, Paper } from '@material-ui/core';
import { Colors, Fonts, MOBILE_BREAKPOINT } from '../../styles/global';
import { useMemo } from 'react';

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


// export const ImageURLHeading = styled.p`
//   font-family: ${Fonts.headline} !important;
//   font-style: normal  !important;
//   font-size: 100px !important;
//   text-align: center;
//   margin: 0;
//   margin-top: 60px;
//   margin-bottom: 60px;
//   text-transform: capitalize !important;
//   color: ${Colors.offwhite};

//   span {
//     font-family: ${Fonts.headline};
//     color: ${Colors.lime};
//   }

//   @media (max-width: ${MOBILE_BREAKPOINT}) {
//     font-size: 58px;
//     line-height: 100px;
//     margin: 30px auto;
//   }
//   `;
export const ImageURLHeading = styled(({ children, className, whiteText = true, width = 500, height = 150 }) => {
  const foregroundColor = whiteText ? 'white' : 'black';
  const backgroundColor = whiteText ? 'black' : 'white';
  const prompt = encodeURIComponent(`an image with the text "${children}" displayed in an elegant, decorative serif font. The font has high contrast between thick and thin strokes,that give the text a sophisticated and stylized appearance. The text is in ${foregroundColor}, set against a solid ${backgroundColor} background, creating a striking and bold visual contrast.  Incorporate elements related to pollinations, digital circuitry, such as flowers, chips, insects, wafers, and other organic forms into the design of the font. Each letter features unique, creative touches that make the typography stand out.  Incorporate elements related to pollinations, digital circuitry, and organic forms into the design of the font.`);
  const seed = useMemo(() => Math.floor(Math.random() * 10), []);
  const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`;

  return (
    <div className={className}>
      <img src={imageUrl} alt={children} />
    </div>
  );
})`


  text-align: center;
  margin: 60px auto;

  img {
    width: 100%;
    max-width: 500px;
    height: auto;
  }

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    margin: 0px auto;
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
