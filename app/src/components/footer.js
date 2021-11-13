import GpuInfo from "./molecules/GpuInfo"
import ContentIdInfo from "./molecules/ContentId"
import ToolBar from "./Toolbar"
import Instructions from "./molecules/Instructions"

const Footer = ({ ...node }) => <ToolBar node={node}>
    {
        node?.connected ?  <>
            <GpuInfo {...node} />
            <ContentIdInfo {...node} />
        </> 
        : <Instructions />
    }
</ToolBar>


export default Footer