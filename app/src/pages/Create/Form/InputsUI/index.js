import TextField from "@material-ui/core/TextField";
import DropZone from "../../../../components/form/customInputs/file";
import Boolean from "./Boolean";
import DropDown from "./DropDown";
import Slider from "./Slider";
import String from "./String";
  

  const TypeMaps = {
    'string': props => <String {...props}/>,
    'integer': props => props.maximum ? <Slider {...props} /> : <TextField {...props} type='number' />,
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