import type { FC } from "react";
import { useState } from "react";

type ApiKey = {
    start: string;
    name: string;
    description: string;
};

const dummyKey: ApiKey = {
    start: "aeoinf",
    name: "MyCoolAppKey",
    description: "This is a cool app key",
};

type Props = {
    test: string;
};

export const KeyManagement: FC<Props> = ({ test }) => {
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);

    console.log(test);

    return (
        <div>
            {apiKeys.map((apiKey) => (
                <div key={apiKey.start}>
                    {apiKey.name} {apiKey.start}
                </div>
            ))}
            <button
                type="button"
                onClick={() => setApiKeys((c) => [...c, dummyKey])}
            >
                Generate
            </button>
        </div>
    );
};
