import { Typography, Box } from "@material-ui/core"
import { Colors } from "../../../styles/global"

export function ServerLoadAndGenerationInfo({ lastImage, imagesGenerated, image }) {
  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      style={{ gap: "2em", marginBottom: "2em" }}
    >
      <ServerLoadDisplay concurrentRequests={lastImage?.concurrentRequests || 0} />
      <Typography variant="body1" component="span">
        #: <b style={{ color: Colors.lime }}>{formatImagesGenerated(imagesGenerated)}</b>
      </Typography>
      <TimingInfo image={lastImage} />
    </Box>
  )
}
function ServerLoadDisplay({ concurrentRequests }) {
  const max = 5
  const load = Math.min(max, Math.round(concurrentRequests / 4))
  const loadDisplay = "▁▃▅▇▉".slice(1, load + 2)

  return (
    <span>
      Load: <b style={{ color: Colors.lime }}>{loadDisplay}</b> <i>({concurrentRequests})</i>
    </span>
  )
}
const formatImagesGenerated = (num) => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}
function TimingInfo({ image }) {
  // console.log("image", image);
  const timeMs = image?.generationTime || image?.timingInfo?.[5]?.timestamp
  return (
    <Typography variant="body2" component="i">
      Generation time:
      <span style={{ color: Colors.lime }}>
        <b> {Math.round(timeMs / 100) / 10} s</b>
      </span>
    </Typography>
  )
}
