import styled from "@emotion/styled"

export const SectionBgBox = styled.div`
  background-color: rgba(0, 0, 0, 0.3);
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