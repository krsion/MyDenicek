import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <FluentProvider theme={webLightTheme}>
    <App />
  </FluentProvider>,
);
