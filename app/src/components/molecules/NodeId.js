import { Typography } from "@material-ui/core"
import { displayContentID } from "../../network/utils"
import RouterLink from "./RouterLink"


const NodeIdInfo = ({ nodeID, connected }) => {
    if (!connected) return <></>
    if (!nodeID) return <Typography> NodeID: N/A </Typography>
    return <Typography > NodeID:&nbsp;
        <RouterLink to={`/n/${nodeID}`}>
            {displayContentID(nodeID)}
        </RouterLink>
    </Typography>
}

export default NodeIdInfo;