import { Typography } from "@material-ui/core"
import { Link } from "react-router-dom"
import { displayContentID } from "../../network/utils"

const ContentIdInfo = ({ contentID, connected }) => {
    if (!connected) return <></>
    if (!contentID) return <Typography> ContentId: N/A </Typography>
    return <Typography > ContentId: <Link to={`/p/${contentID}`} children={displayContentID(contentID)}/> </Typography>
}

export default ContentIdInfo