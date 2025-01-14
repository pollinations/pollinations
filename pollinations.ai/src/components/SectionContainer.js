import styled from "@emotion/styled";

export const SectionContainer = styled.div`
  width: 100%;
  display: flex;
  background-color: ${(props) => props.background || props.backgroundColor || 'transparent'};
  margin: 0em auto;
  display: flex;
  flex-direction: column;
  align-items: center;
`; 