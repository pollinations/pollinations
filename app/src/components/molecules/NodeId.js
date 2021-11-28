import { Link as MaterialLink, Typography } from "@material-ui/core"
import { Link } from "react-router-dom"
import { displayContentID } from "../../network/utils"

const NodeIdInfo = ({ nodeID, connected }) => {
    if (!connected) return <></>
    if (!nodeID) return <Typography> NodeID: N/A </Typography>
    return <Typography > NodeID:
        <MaterialLink compponent={Link} to={`/n/${nodeID}`}>
            {displayContentID(nodeID)}
        </MaterialLink>
    </Typography>
}

export default NodeIdInfo;