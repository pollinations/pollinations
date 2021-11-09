import { Typography } from "@material-ui/core"


const GpuInfo = ({ ...node }) => {
    if (!node.connected) return <div/>
    return <Typography children={`GPU: ${gpu2string(node?.gpu)}`}/>
}

let gpu2string = gpu => {
    let parsed = gpu?.replace(/\(.*\)/g, "")?.replace("GPU 0:", "")?.split("-")[0]?.trim()
    return parsed && `${parsed} ${gpuSmilie[parsed]}`
}
const gpuSmilie = {
    "Tesla T4" : "😐",
    "Tesla K80" : "😴",
    "Tesla P100" : "😀",
    "Tesla V100" : "😍",
}

export default GpuInfo