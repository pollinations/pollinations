import { useState } from 'react'
import Accordion from '@material-ui/core/Accordion';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import AccordionDetails from '@material-ui/core/AccordionDetails';
import Typography from '@material-ui/core/Typography';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';


export default function Acordion({visibleContent, hiddenContent}) {
  const [ isOpen, setOpen ] = useState(false)

  return <div style={{width: '60%'}}>
      <Accordion style={{backgroundColor: 'transparent', boxShadow: 'none'}}>
        <AccordionSummary 
          expandIcon={<ExpandMoreIcon />}
          aria-controls="panel1a-content"
          id="panel1a-header"
          children={visibleContent}/>
        
        <AccordionDetails
        children={hiddenContent}/>
      </Accordion>
  </div>
}