import styled from '@emotion/styled'


const Style = styled.div`
width: 100%;

display: flex;
flex-direction: column;

label{
    font-family: 'DM Sans';
    font-style: normal;
    font-weight: 500;
    font-size: 14px;
    line-height: 18px;
    text-transform: uppercase;

    color: #B1B1B1;
    margin: 0.5em 0 0 0;
    // border-bottom: 1px solid red;
}

`

const Input = styled.input`

// font-family: 'Space Grotesk';
font-style: normal;
font-weight: 400;
font-size: 24px;
line-height: 31px;

padding: 0.2em;
border: none;
color: #FFFFFF;
background: transparent;

`

const String = props => <Style>
    <label>
        {props.title}
    </label>
    <Input type='text' {...props}/>
</Style>

export default String