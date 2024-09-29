import { useMediaQuery } from "@material-ui/core";
import { MOBILE_BREAKPOINT } from "../styles/global";

const useIsMobile = () => {
    return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT})`);
};

export default useIsMobile;