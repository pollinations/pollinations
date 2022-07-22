import SliderBase from '@material-ui/core/Slider';


const Slider = props => {

    const { setFieldValue, id, minimum, maximum, label, description } = props;

    function handleChange(event, newValue) {
        setFieldValue(id, newValue);
    }


    return <div>
    <label>
        {label}
    </label>
    <SliderBase 
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
    <label style={{opacity: 0.5}}>
        {description}
    </label>
    </div>
}

export default Slider