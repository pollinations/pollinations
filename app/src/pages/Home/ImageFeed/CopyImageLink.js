import React from "react"
import { IconButton } from "@material-ui/core"
import { FileCopy as FileCopyIcon } from "@material-ui/icons"
import { CustomTooltip } from "../../../components/CustomTooltip"
import { Colors } from "../../../styles/global"

export function CopyImageLink({ handleCopyLink, isLoading }) {
    return (
        <CustomTooltip title="Copy image link.">
            <IconButton onClick={handleCopyLink} disabled={isLoading} style={{ marginLeft: "0.5em" }}>
                <FileCopyIcon style={{ color: Colors.lime, fontSize: "1.5rem" }} />
            </IconButton>
        </CustomTooltip>
    )
}