import Button from "@material-ui/core/Button"
import styled from '@emotion/styled'

const ToolBar = ({ node, showNode }) => {

    if (!node.connected && !node.contentID) return <></>;

    return <ToolBarStyle>
        <Button onClick={showNode} children='[ Current Pollen ]' />
    </ToolBarStyle>
}

const ToolBarStyle = styled.div`
position: fixed;
bottom: 0;
right: 30;
border-radius: 10px 10px 0 0;
background-color: #222;
padding: 0.3em;
z-index: 10;
`;

export default ToolBar