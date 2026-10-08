import React from "react";
import ReactDOM from "react-dom/client";

import DashboardPage from "./DashboardPage";
import "../ui/theme.css";
import "./dashboard.css";

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <DashboardPage />
  </React.StrictMode>
);
