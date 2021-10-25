import { Box, Container, Link } from "@material-ui/core";
import NotebookSelector from "../components/NotebookSelector";
import { Switch, Route } from "react-router";
import { getRoutes } from "../routes";

export const AppContainer = () => {

    const routes = getRoutes();

    return <>
        {/* Nav Bar */}
        <NotebookSelector />

        {/* Children that get IPFS state */}
        <Container maxWidth="md">
            <Switch children={
            routes.map(({ Page, ...route }) => 
                <Route {...route} 
                    key={route.path} 
                    component={Page}/>
            )
            }/>
        </Container>

        {/* Footer */}
        <Box align="right" fontStyle="italic">
            Discuss, get help and contribute on <Link href="https://github.com/pollinations/pollinations/discussions">[ Github ]</Link> or <Link href="https://discord.gg/XXd99CrkCr" target="_blank">[ Discord ]</Link>.
        </Box>
    </>
}