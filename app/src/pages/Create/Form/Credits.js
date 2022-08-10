import { Accordion, AccordionSummary } from "@material-ui/core";
import styled from '@emotion/styled';
import Markdown from "markdown-to-jsx"
import Add from '@material-ui/icons/Add';

export default function CreditsView({ credits }){

    if (!credits) return null;

    return <Accordion elevation={0} fullWidth>
        <AccordionSummary expandIcon={<Add />} fullWidth>
            Credits
        </AccordionSummary>

        <Style>
            <Markdown>
                {credits}
            </Markdown>
        </Style>
    </Accordion>
}
const Style = styled.div`
width: 100%;
`