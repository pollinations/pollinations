import Box from "@material-ui/core/Box"
import Button from "@material-ui/core/Button"
import Typography from "@material-ui/core/Typography"
import Debug from "debug"
import { useMemo } from "react"
import TopAlert from "../components/organisms/TopAlert"
import { getNotebooks } from "../data/notebooks"
import useFilter from "../hooks/useFilter"
import useIPFS from "../hooks/useIPFS"
import Slider, { Slide } from "../components/Slider"

const debug = Debug("home")


export default function Models() {
  const ipfs = useIPFS("/ipns/k51qzi5uqu5dhl19ih5j7ghhgte01hoyvraq86gy0zab98iv5sd1dr3i9huvb1")

  const notebooks = useMemo(() => getNotebooks(ipfs), [ipfs])

  const { notebookList, options, option } = useFilter(notebooks)

  debug("got notebooks", notebooks)
  return (
    <>
      <TopAlert options={options} />



      {
        options
        .filter( opt => opt !== 'Anything')
        .map( opt => <>
        <h3 children={`outputs ${opt}`}/>
        <Slider>
            {notebookList
            // only show certain catregory
            .filter(notebook => notebook.controls.output === opt)
            .map((notebook) => (
              <Slide key={notebook.name} {...notebook} />
            ))}
        </Slider>
        </>
        )
      }
{/* 

      <Box margin="3em 0">
        <Filter options={options} option={option} />
      </Box>

      <Slider>
        {notebookList.map((notebook) => (
          <Slide key={notebook.name} {...notebook} />
        ))}
      </Slider> */}

    </>
  )
}

const Filter = ({options, option}) => {
  
  // if (!options.length) return <></>;
  
  return (
  <>
    <Typography
      className="Lato"
      align="center"
      variant="h3"
      gutterBottom
      style={{ marginBottom: "0.8em" }}
    >
      {!options.length ? 'loading...' : 'What do you want to create?'}
    </Typography>

    <Box display="flex" justifyContent="center">
      {!options.length || options?.map((opt) => (
        <Button
          key={opt}
          style={{ margin: "0 0.5em" }}
          variant={opt === option.selected ? "contained" : "outlined"}
          color={opt === option.selected ? "secondary" : "primary"}
          onClick={() => option.setSelected(opt)}
        >
          {opt}
        </Button>
      ))}
    </Box>
  </>
) 
}
