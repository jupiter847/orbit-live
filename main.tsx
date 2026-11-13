import { createRoot } from "react-dom/client";
import OrbitApp from "./OrbitApp";
import "./globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("ORBIT LIVE root element is missing.");
createRoot(root).render(<OrbitApp />);
