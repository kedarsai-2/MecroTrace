import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.tsx";
import "./index.css";

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("capacitor-native");
}

const rootElement = document.getElementById("root")!;

createRoot(rootElement).render(<App />);

requestAnimationFrame(() => {
  rootElement.removeAttribute("style");
  document.body.removeAttribute("style");
});
