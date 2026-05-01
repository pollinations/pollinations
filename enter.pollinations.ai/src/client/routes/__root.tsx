import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

type RouterContext = {};

export const Route = createRootRouteWithContext<RouterContext>()({
    component: Outlet,
});
