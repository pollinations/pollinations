import React from 'react';
import styled from '@emotion/styled';
// interface Props extends SVGAttributes<SVGElement> {
//   path: string;
//   size?: number;
//   color?: string;
// }
const Icon = (props) => {
  const { path, size, ...rest } = props;
  return (
    <Wrapper viewBox="0 0 1024 1024" size={size || 16} {...rest}>
      <path d={path}></path>
    </Wrapper>
  );
};

export default Icon;

const Wrapper = styled.svg`
  display: inline-block;
  vertical-align: middle;
  width: ${(p) => p.size}px;
  height: ${(p) => p.size}px;

  path {
    fill: ${(p) => p.color};
  }
`;
