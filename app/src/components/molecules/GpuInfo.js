import { Typography } from "@material-ui/core"


const GpuInfo = ({ ...node }) => {
    if (!node.connected) return <div/>
    return <Typography>GPU: { gpu2string(node?.gpu) }</Typography>
}

let gpu2string = gpu => {
    let parsed = gpu?.replace(/\(.*\)/g, "")?.replace("GPU 0:", "").replace("Tesla ","")?.split("-")[0]?.trim()
    return parsed && <><i style={{fontSize: "90%"}}>{parsed}</i> {gpuSmilie[parsed]}</>
}
const gpuSmilie = {
    "T4" : "😐",
    "K80" : "😴",
    "P100" : "😀",
    "V100" : "😍",
}

export default GpuInfo