import { Link, Typography } from "@material-ui/core"
import { displayContentID } from "../../network/utils"

const ContentIdInfo = ({ contentID, connected }) => {
    if (!connected) return <></>
    if (!contentID) return <Typography> ContentId: N/A </Typography>
    return <Typography >
                ContentId: 
                <Link href={`https://pollinations.ai/ipfs/${contentID}`} target="_blank">
                    { displayContentID(contentID) }
                </Link>
            </Typography>
}

export default ContentIdInfo