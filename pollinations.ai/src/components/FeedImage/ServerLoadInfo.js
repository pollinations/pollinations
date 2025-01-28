import { Typography, Box } from "@mui/material"
import { Colors, Fonts } from "../../config/global"

export function ServerLoadInfo({ lastImage, imagesGenerated, image }) {
  return (
    <Box
      display="flex"
      flexDirection={{ xs: "column", sm: "row" }}
      justifyContent="center"
      alignItems="center"
      style={{ gap: "2em" }}
      sx={{
        color: Colors.offwhite,
        fontSize: "1.em",
      }}
    >
      <ServerLoadDisplay concurrentRequests={lastImage?.concurrentRequests || 0} />
      <Box style={{ color: Colors.offwhite, fontSize: "1.8em", fontFamily: Fonts.headline }}>
        #: <b style={{ color: Colors.lime }}>{formatImagesGenerated(imagesGenerated)}</b>
      </Box>
      {/* <TimingInfo image={lastImage} /> */}
    </Box>
  )
}
function ServerLoadDisplay({ concurrentRequests }) {
  const max = 5
  const load = Math.min(max, Math.round(concurrentRequests / 4))
  const loadDisplay = "▁▃▅▇▉".slice(1, load + 2)

  return (
    <Box style={{ color: Colors.offwhite, fontSize: "1.8em", fontFamily: Fonts.headline }}>
      Load: <b style={{ color: Colors.lime }}>{loadDisplay}</b> <i>({concurrentRequests})</i>
    </Box>
  )
}
const formatImagesGenerated = (num) => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}
function TimingInfo({ image }) {
  // console.log("image", image);
  const timeMs = image?.generationTime || image?.timingInfo?.[5]?.timestamp
  return (
    <Typography variant="body" component="i" style={{ fontSize: "1.2em" }}>
      Generation time: 
      <span style={{ color: Colors.lime }}>
        <b> {Math.round(timeMs / 100) / 10} s</b>
      </span>
    </Typography>
  )
}
