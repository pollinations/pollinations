import { useMediaQuery } from "@mui/material";
import { MOBILE_BREAKPOINT } from "../config/global";

const useIsMobile = () => {
    return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT})`);
};

export default useIsMobile;