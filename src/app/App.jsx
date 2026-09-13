import React from "react";
import { BrowserRouter } from "react-router-dom";
import Router from "./router";
import { ThemeProvider } from "./providers/ThemeProvider";
import { FirebaseProvider } from "./providers/FirebaseProvider";
import { AlertProvider } from "./providers/AlertProvider";
import { AuthProvider } from "./providers/AuthProvider";
import ArabicTextRepairProvider from "./providers/ArabicTextRepairProvider";
import { GlobalEmployeeModalProvider } from "./providers/GlobalEmployeeModal";

export default function App() {
  return (
    <ThemeProvider>
      <FirebaseProvider>
        <AlertProvider>
          <AuthProvider>
            <BrowserRouter>
              <ArabicTextRepairProvider>
                <GlobalEmployeeModalProvider>
                  <Router />
                </GlobalEmployeeModalProvider>
              </ArabicTextRepairProvider>
            </BrowserRouter>
          </AuthProvider>
        </AlertProvider>
      </FirebaseProvider>
    </ThemeProvider>
  );
}
