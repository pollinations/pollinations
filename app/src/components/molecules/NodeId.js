import { Typography } from "@material-ui/core"
import { Link } from "react-router-dom"
import { displayContentID } from "../../network/utils"

const NodeIdInfo = ({ nodeID, connected }) => {
    if (!connected) return <></>
    if (!nodeID) return <Typography> NodeID: N/A </Typography>
    return <Typography > NodeID: <Link to={`/n/${nodeID}`} children={displayContentID(nodeID)}/> </Typography>
}

export default NodeIdInfo;