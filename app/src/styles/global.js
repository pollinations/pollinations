import styled from '@emotion/styled'

export const GlobalSidePadding = '0 2.5%';
export const MOBILE_BREAKPOINT = '768px'

export const BaseContainer = styled.div`
  width: 100%;
  padding: ${GlobalSidePadding};
`;

export const MarkDownStyle = styled.div`
h6 {
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.6;
  color: #fdfdfd;
}
p{
  font-size: 1.1rem;
  line-height: 1.43;
  color: #fdfdfd;
}
`
export const SmallContainer = styled.div`
min-width: 20%;
max-width: 600px;
margin: auto;
margin-bottom: 7em;
padding: ${GlobalSidePadding};
`
export const GridStyle = styled.div`
display: grid;
grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
grid-gap: 1em;
`
