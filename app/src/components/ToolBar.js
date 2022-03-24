import GpuInfo from "./molecules/GpuInfo"
import ContentIdInfo from "./molecules/ContentId"
import ToolBarContainer from "./organisms/Toolbar"
import Instructions from "./molecules/Instructions"
import NodeIdInfo from "./molecules/NodeId"

const ToolBar = ({ node, showNode }) => <ToolBarContainer node={node} showNode={showNode}>
    {
        node?.connected ?  <>
            <GpuInfo {...node} />
            <NodeIdInfo {...node} />
            <ContentIdInfo {...node} />
        </> 
        : <Instructions />
    }
</ToolBarContainer>


export default ToolBar