import styled from '@emotion/styled';

export default styled.button`

width: 129px;
height: 52;
background: #D8E449;
border-radius: 40px;

margin-left: ${props => props.marginLeft ?? 'calc(-129px - 0.5em)'};

border: none;

font-family: 'DM Sans';
font-style: normal;
font-weight: 700;
font-size: 17px;
line-height: 22px;
text-align: center;
text-transform: uppercase;

color: #040405;
cursor: pointer;

:disabled {
background-color: grey;
}
`