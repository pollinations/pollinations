import Debug from "debug";
import { useEffect, useState } from "react";
const debug = Debug("useFetchText");
const useFetchText = (url, placeholderText, errorMessage) => {
    const [text, setText] = useState(placeholderText);
    useEffect(() => {
        fetch(url)
            .then((res) => res && res.text())
            .then((data) => data && setText(data))
            .catch((err) => {
                debug(err);
                setText(errorMessage);
            });
    }, [url]);
    return text;
};
export default useFetchText;
