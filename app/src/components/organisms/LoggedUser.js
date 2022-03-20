import { Avatar, Menu, MenuItem } from '@material-ui/core';
import * as React from 'react';
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";




const LoggedUser = ({ user }) => {
    const { handleSignOut } = useAuth()
    const navigate = useNavigate()
    
    const [anchorEl, setAnchorEl] = React.useState(null);
    const open = Boolean(anchorEl);
 
    return <>
        <Avatar onClick={e => setAnchorEl(e.currentTarget)} src={user?.user_metadata?.avatar_url}/>
        <Menu  anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)} style={{ marginTop: '2em' }}>

            {/*<MenuItem onClick={() => {*/}
            {/*    setAnchorEl(null)*/}
            {/*    navigate("profile")*/}
            {/*}} > Profile </MenuItem>*/}

            <MenuItem onClick={() => {
                setAnchorEl(null)
                navigate("localpollens")
            }}> My Pollens </MenuItem>

            <MenuItem onClick={() => {
                setAnchorEl(null)
                handleSignOut()
            }}> Logout </MenuItem>

      </Menu>
    </>
}

export default LoggedUser