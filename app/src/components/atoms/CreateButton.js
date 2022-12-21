import styled from "@emotion/styled";
import { Colors, MOBILE_BREAKPOINT } from "../../styles/global";

const CreateButton = styled.button`
    width: 129px;
    height: 52;
    background: ${Colors.accent};
    border-radius: 40px;

    margin-left: ${props => props.marginLeft || 'calc(-129px - 0.5em)'};

    border: none;

    font-family: 'Uncut-Sans-Variable';
    font-style: normal;
    font-weight: 700;
    font-size: 16px;
    line-height: 20px;

    text-transform: uppercase;

    color: #040405;
    cursor: pointer;

    :disabled {
    // background-color: ${Colors.active_button};
    color: ${Colors.offwhite};
    background: linear-gradient(90deg, magenta, #cc00cc);
	background-size: 400% 400%;
	animation: gradient 2s ease infinite;
    animation-direction: alternate;
    }
    @media (max-width: ${MOBILE_BREAKPOINT}) {
    width: 100px;
    margin-left: ${props => props.marginLeft || 'calc(-100px - 0.5em)'};
    font-weight: 500;
    }

    @keyframes gradient {
        0% {
            background-position: 0% 50%;
        }
        50% {
            background-position: 100% 50%;
        }
        100% {
            background-position: 0% 50%;
        }
    }
`

export default CreateButton