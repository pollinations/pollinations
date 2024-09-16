import React from "react"
import { Grid, CircularProgress } from "@material-ui/core"
import { ImageURLHeading } from "../ImageHeading"
import { Colors } from "../../../styles/global"

export function LoadingIndicator() {
    return (
        <Grid container justifyContent="center" alignItems="center" style={{ marginBottom: "8em", position: "relative" }}>
            <ImageURLHeading whiteText={Colors.offwhite} width={600} height={500} prompt="A simple, elegant hourglass symbol representing waiting, minimalist design, high-quality illustration">
                Loading...
            </ImageURLHeading>
            <CircularProgress color={"inherit"} style={{ color: Colors.offwhite, position: "absolute" }} />
        </Grid>
    )
}