import { useState } from "react";

const useContribCount = () => {
    // GitHub REST API doesn't return all contributors (caps at ~100).
    // GitHub UI shows 300 contributors, so we use that as our baseline.
    const [contribs] = useState<string>("300+");
    const [loading] = useState(false);
    const [error] = useState<string | null>(null);

    return { contribs, loading, error };
};

export default useContribCount;
