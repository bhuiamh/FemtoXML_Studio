import { useEffect, useState } from "react";
import { XmlComparison } from "./components/XmlComparison";
import XmlEditor from "./components/XmlEditor";
import BulkXmlEditor from "./components/BulkXmlEditor";
import NeighborListExcel from "./components/NeighborListExcel";
import DynamicPathExcel from "./components/DynamicPathExcel";
import SiteConfigMatrix from "./components/SiteConfigMatrix";
import LoginScreen from "./components/LoginScreen";
import { AppShell, type ViewMode } from "./components/AppShell";
import { SegmentedControl } from "./components/ui";
import { endSession, hasSession } from "./auth";

type EditorMode = "normal" | "bulk";

function App() {
  const [signedIn, setSignedIn] = useState(hasSession);
  const [currentView, setCurrentView] = useState<ViewMode>("comparison");
  const [editorMode, setEditorMode] = useState<EditorMode>("normal");

  useEffect(() => {
    document.title = "FemtoXML Studio — XML Comparator & Editor";
    let metaDesc = document.querySelector(
      'meta[name="description"]',
    ) as HTMLMetaElement | null;
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute(
      "content",
      "FemtoXML Studio: professional XML comparison and editing tool optimized for Femto devices. Compare, edit and export XML reports.",
    );

    let metaKeywords = document.querySelector(
      'meta[name="keywords"]',
    ) as HTMLMetaElement | null;
    if (!metaKeywords) {
      metaKeywords = document.createElement("meta");
      metaKeywords.setAttribute("name", "keywords");
      document.head.appendChild(metaKeywords);
    }
    metaKeywords.setAttribute(
      "content",
      "XML comparison, XML editor, Femto, RAN, network, XML diff, FemtoXML Studio",
    );
  }, []);

  if (!signedIn) {
    return <LoginScreen onSignedIn={() => setSignedIn(true)} />;
  }

  const signOut = () => {
    endSession();
    setSignedIn(false);
  };

  return (
    <AppShell
      current={currentView}
      onSelect={setCurrentView}
      onSignOut={signOut}
      actions={
        currentView === "editor" ? (
          <SegmentedControl<EditorMode>
            value={editorMode}
            onChange={setEditorMode}
            options={[
              { value: "normal", label: "Tree editor" },
              { value: "bulk", label: "Bulk editor" },
            ]}
          />
        ) : undefined
      }
    >
      {currentView === "comparison" && <XmlComparison />}
      {currentView === "matrix" && <SiteConfigMatrix />}
      {currentView === "neighbour" && <NeighborListExcel />}
      {currentView === "dynamic" && <DynamicPathExcel />}
      {currentView === "editor" &&
        (editorMode === "normal" ? <XmlEditor /> : <BulkXmlEditor />)}
    </AppShell>
  );
}

export default App;
