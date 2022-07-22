import SliderBase from '@material-ui/core/Slider';


const Slider = props => {

    const { setFieldValue, id, minimum, maximum } = props;

    function handleChange(event, newValue) {
        setFieldValue(id, newValue);
    }


    return <SliderBase 
        {...props} 
        onChange={handleChange} 
        min={minimum} 
        max={maximum} 
        step={1} 
        marks={[
            { value: minimum, label: minimum },
            { value: maximum, label: maximum },
        ]}
        />
}

export default Slider