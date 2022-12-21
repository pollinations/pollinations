import { Avatar, Menu, MenuItem } from '@material-ui/core';
import * as React from 'react';
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import styled from '@emotion/styled'

const LoggedUser = ({ user }) => {
    const { handleSignOut } = useAuth()
    const navigate = useNavigate()
    
    const [anchorEl, setAnchorEl] = React.useState(null);
    const open = Boolean(anchorEl);
 
    return <Container>
        <Avatar onClick={e => setAnchorEl(e.currentTarget)} src={user?.user_metadata?.avatar_url}/>
        <Menu  anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)} style={{ marginTop: '2em' }}>

            <MenuItem onClick={() => {
                setAnchorEl(null)
                navigate("/d")
            }}> Dashboard </MenuItem>

            <MenuItem onClick={() => {
                setAnchorEl(null)
                handleSignOut()
            }}> Logout </MenuItem>

      </Menu>
    </Container>
}

export default LoggedUser

const Container = styled.div`
width: 100%;
display: flex;
justify-content: flex-end;
`