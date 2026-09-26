import { useEffect, useState } from "react";
import type { SourceInfo } from "./flow-environment";

export function FlowSource() {
    const [source, setSource] = useState(window.__FLOW_ENVIRONMENT__.source);
    useEffect(() => {
        const refresh = async () => {
            const response = await fetch("/__flow/source");
            if (response.ok) setSource((await response.json()) as SourceInfo);
        };
        import.meta.hot?.on("flow:source-refreshed", refresh);
        return () => import.meta.hot?.off("flow:source-refreshed", refresh);
    }, []);
    return (
        <nav className="flow-source" aria-label="Source revisions">
            <a
                href={`https://github.com/pollinations/pollinations/tree/${source.mainRevision}`}
                target="_blank"
                rel="noreferrer"
            >
                Main {source.mainRevision.slice(0, 10)}
            </a>
            <span aria-hidden="true"> · </span>
            <a
                href={`https://github.com/pollinations/pollinations/tree/${source.revision}`}
                target="_blank"
                rel="noreferrer"
            >
                Flow {source.revision.slice(0, 10)}
            </a>
            {source.dirty && <span> · Local changes</span>}
            <span> · Fixture data</span>
        </nav>
    );
}
