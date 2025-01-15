import styled from "@emotion/styled";
import { Colors } from "../config/global";
export const SectionContainer = styled.div`
  width: 100%;
  display: flex;
  background-color: ${(props) => props.backgroundColor || 'transparent'};
  margin: 0em auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1em;
`; 

export const SectionSubContainer = styled.div`
        display: flex;
        flex-direction: ${props => props.flexDirection || 'column'};
        align-items: ${props => props.alignItems || 'center'};   
        gap: 2em;
        max-width: 1000px;
        margin-left: auto;
        margin-right: auto;
        width: 100%;
        padding-bottom: 4em;
        padding-top: 2em;
`;

export const SectionBgBox = styled.div`
  background-color: ${(props) => props.backgroundcolor || `${Colors.offblack2}70`};
  border-radius: 20px;
  max-width: 1000px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1em;

  /* When screen width is small (xs), make background transparent */
  @media (max-width: 600px) {
    background-color: transparent;
  }
`