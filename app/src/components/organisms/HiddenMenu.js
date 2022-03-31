import * as React from 'react';
import styled from '@emotion/styled';
import { HorizontalBorder } from '../atoms/Borders';

export default function HiddenMenu({ children, state }) {
  const [open, setOpen] = state;

  return (
    <>
      <VisibleContentStyle children={children[0]} />

      <HorizontalBorder />

      <HiddenContentStyle open={open} children={children[1]} />
    </>
  );
}

const VisibleContentStyle = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
`;

const HiddenContentStyle = styled.div`
  width: 100%;
  height: ${(props) => (props.open ? '0px' : 'auto')};
  transition: height 0.1s ease-in;

  padding: 0.1em 1em;
  overflow-y: hidden;
  background-color: transparent;
  text-transform: uppercase;

  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(calc(90vw / 6), 1fr));
  align-items: center;
`;
