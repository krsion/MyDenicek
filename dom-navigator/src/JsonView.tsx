import JsonViewEditor from '@uiw/react-json-view/editor';
import { githubLightTheme } from '@uiw/react-json-view/githubLight';
import { useEffect, useState } from "react";


export const JsonView = ({ data }: { data: unknown }) => {
    const [currentData, setCurrentData] = useState<unknown>(() => JSON.parse(JSON.stringify(data)));

    useEffect(() => {
        setCurrentData(JSON.parse(JSON.stringify(data)));
    }, [data]);


    return (
        <JsonViewEditor
            value={currentData as object}
            style={githubLightTheme}
            onEdit={() => true}
        />
    );
};
