import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./translations/i18n";

createRoot(document.getElementById("root")!).render(<App />);