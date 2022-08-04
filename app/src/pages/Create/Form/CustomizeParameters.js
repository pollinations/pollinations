import { Accordion, AccordionSummary } from "@material-ui/core";
import Add from '@material-ui/icons/Add';
import styled from '@emotion/styled';
import ParameterViewer from './InputsUI/';

const CustomizeParameters = ({ formik, isDisabled, inputs }) => { 

    if (!inputs) return null;
    if (!Object.keys(inputs).length) return null;

    return <Styles>
        <Accordion elevation={0} fullWidth>
            <AccordionSummary expandIcon={<Add />} fullWidth>
                Customize
            </AccordionSummary>

            <ParametersStyle children={Object.keys(formik.values)
            .filter((key, idx, array) => {
                if (!inputs[key]) return array;
                return inputs[key]['x-order'] !== 0
            })
            .map(key => <>
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
                </>
            )} />
        </Accordion>
    </Styles>
}

const Styles = styled.div`

width: 100%;

// MUI overrides 
.MuiPaper-root{
    background-color: transparent !important;
}
.MuiCollapse-root {
    color: #fff;
    transition: box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
    background-color: #0F0F13 !important;
    padding: 1em;

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
`
const ParametersStyle = styled.div`
display: flex;
flex-direction: column;
width: 100%;
gap: 2em;
`

export default CustomizeParameters;