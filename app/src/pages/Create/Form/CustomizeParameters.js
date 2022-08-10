import { Accordion, AccordionSummary } from "@material-ui/core";
import Add from '@material-ui/icons/Add';
import styled from '@emotion/styled';
import ParameterViewer from './InputsUI/';
import { MOBILE_BREAKPOINT } from "../../../styles/global";
import CreditsView from "./Credits";

const CustomizeParameters = ({ formik, isDisabled, inputs, credits }) => { 

    if (!inputs) return null;
    if (!Object.keys(inputs).length) return null;

    return <Styles>
        <Accordion elevation={0} fullWidth>
            <AccordionSummary expandIcon={<Add />} fullWidth>
                Customize
            </AccordionSummary>

            <ParametersStyle>
                {
                Object.keys(formik.values)
                .filter((key, idx, array) => {
                    if (!inputs[key]) return array;
                    return inputs[key]['x-order'] !== 0
                })
                .map(key => 
                    <ParameterViewer
                        key={key}
                        id={key}
                        {...inputs[key]}
                        disabled={isDisabled}
                        label={inputs[key]?.title}
                        helperText={inputs[key]?.description}
                        value={formik.values[key]}
                        onChange={formik.handleChange}
                        setFieldValue={formik.setFieldValue}
                    />
                )} 
            </ParametersStyle>
        </Accordion>
        <CreditsView credits={credits}/>
    </Styles>
}

const Styles = styled.div`
width: 30%;
@media (max-width: ${MOBILE_BREAKPOINT}) {
    width: 100%;
}
padding: 0 1em;
margin-bottom: 2em;

// MUI overrides 
.MuiPaper-root{
    background-color: transparent !important;
}
.MuiCollapse-root {
    color: #fff;
    transition: box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
    background-color: #0F0F13 !important;
    padding: 1em;

    max-height: 60vh;
    overflow-y: scroll;
    overflow-x: hidden;

}
.MuiAccordion-root{
    background: transparent;
}
.MuiAccordionSummary-content{
    font-family: 'DM Sans';
    font-style: normal;
    font-weight: 500;
    font-size: 14px;
    line-height: 18px;
    text-transform: uppercase;
    
    color: #B1B1B1;
}

// .styled-scrollbars {
    /* Foreground, Background */
    scrollbar-color: #D8E449 #383838;
//   }
  ::-webkit-scrollbar {
    width: 10px; /* Mostly for vertical scrollbars */
    height: 10px; /* Mostly for horizontal scrollbars */
  }
  ::-webkit-scrollbar-thumb { /* Foreground */
    background: #D8E449;
  }
  ::-webkit-scrollbar-track { /* Background */
    background: #383838;
    // box-shadow: inset 2px 2px 2px rgba(0, 0, 0, 0.37);
    // border-radius: 3px;
  }
`
const ParametersStyle = styled.div`
display: grid;
grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
width: 100%;
gap: 2em;
`

export default CustomizeParameters;