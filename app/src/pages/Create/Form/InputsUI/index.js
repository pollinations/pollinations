import TextField from "@material-ui/core/TextField";
import DropZone from "./File";
import Boolean from "./Boolean";
import DropDown from "./DropDown";
import Slider from "./Slider";
import String from "./String";
  

  const TypeMaps = {
    'string': props => props.enum ? <DropDown {...props}/> : (props.format === 'uri') ? <DropZone {...props}/> : <String {...props}/>,
    'integer': props => props.maximum ? <Slider {...props} /> : <TextField {...props}  />,
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