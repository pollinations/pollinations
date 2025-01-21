import styled from "@emotion/styled";
import { Colors, Fonts } from "../config/global";
import { Link } from "react-router-dom";

const StyledLink = styled(({ isExternal, ...props }) => 
  isExternal ? <a {...props} /> : <Link {...props} />
)`
  font-family: ${Fonts.body};
  font-style: normal;
  font-weight: 600;
  font-size: 18px;
  line-height: 22px;
  text-decoration-line: none;
  text-transform: uppercase;
  color: inherit;
  transition: color 0.3s ease;
  &:hover {
    text-decoration: underline;
    color: ${(props) => (props.dark ? Colors.accent : Colors.primary)};
  }
`;

export default StyledLink;
