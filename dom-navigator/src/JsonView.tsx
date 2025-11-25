import JsonViewEditor from '@uiw/react-json-view/editor';
import { githubLightTheme } from '@uiw/react-json-view/githubLight';
import { useEffect, useState } from "react";

import type { JsonDoc } from "./Document";

export const JsonView = ({ doc }: { doc: JsonDoc }) => {
    const [currentDoc, setCurrentDoc] = useState<JsonDoc>(() => JSON.parse(JSON.stringify(doc)));

    useEffect(() => {
        setCurrentDoc(JSON.parse(JSON.stringify(doc)));
    }, [doc]);


    return (
        <JsonViewEditor
            value={currentDoc}
            style={githubLightTheme}
            onEdit={() => true}
        />
    );
};
