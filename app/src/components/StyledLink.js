import styled from "@emotion/styled";
import { Colors } from "../styles/global";

// Define LinkStyle if not available in global styles
const LinkStyle = styled.a`
  color: inherit;
  &:hover {
    text-decoration: underline;
  }
`;

const StyledLink = styled(LinkStyle)`
  transition: color 0.3s ease;
  &:hover {
    color: ${(props) => (props.dark ? Colors.accent : Colors.primary)};
  }
`;

export default StyledLink;