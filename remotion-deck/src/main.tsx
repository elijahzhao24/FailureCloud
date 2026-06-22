import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {Presentation} from "./Presentation";
import "./styles.css";
import "./presentation.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Presentation />
  </StrictMode>,
);
