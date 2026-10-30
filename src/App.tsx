import { Route, Routes } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import AuthLayout from "@/components/AuthLayout";
import { CareProvider } from "@/components/care/CareProvider";
import { AppShell } from "@/components/care/AppShell";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Dashboard from "@/pages/Dashboard";
import Today from "@/pages/Today";
import Medications from "@/pages/Medications";
import Nutrition from "@/pages/Nutrition";
import Vitals from "@/pages/Vitals";
import Documents from "@/pages/Documents";
import Alerts from "@/pages/Alerts";
import Profiles from "@/pages/Profiles";
import Family from "@/pages/Family";
import Labs from "@/pages/Labs";
import Notes from "@/pages/Notes";
import Assistant from "@/pages/Assistant";
import Clinician from "@/pages/Clinician";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <AuthLayout>
              <CareProvider>
                <AppShell />
              </CareProvider>
            </AuthLayout>
          }
        >
          <Route path="/" element={null} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/today" element={<Today />} />
          <Route path="/medications" element={<Medications />} />
          <Route path="/nutrition" element={<Nutrition />} />
          <Route path="/vitals" element={<Vitals />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/profiles" element={<Profiles />} />
          <Route path="/family" element={<Family />} />
          <Route path="/labs" element={<Labs />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/clinician" element={<Clinician />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
