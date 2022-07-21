import TextField from "@material-ui/core/TextField";
import DropZone from "../../../../components/form/customInputs/file";
import Boolean from "./Boolean";
import DropDown from "./DropDown";
  

  const TypeMaps = {
    'string': props => <TextField {...props}/>,
    'integer': props => <TextField {...props}  type='number'  />,
    'boolean': props =>  <Boolean {...props} />,
    'dropdown': props => <DropDown {...props} />,
    'file': props => <DropZone {...props} />,
  }

  const ParameterViewer = (props) => {

    const Viewer = TypeMaps[props.type];

    if (!Viewer) return <TextField fullWidth {...props}/>;

    return <Viewer fullWidth {...props}/>;
  }
  
  export default ParameterViewer