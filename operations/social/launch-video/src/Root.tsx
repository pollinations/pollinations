import { Composition } from "remotion";
import { Launch } from "./Launch";
import T from "./timeline.json";

const FPS = 60;

export const Root: React.FC = () => (
    <Composition
        id="Launch"
        component={Launch}
        durationInFrames={T.duration * FPS}
        fps={FPS}
        width={1920}
        height={1080}
    />
);
