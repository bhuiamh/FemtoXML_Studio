import { useEffect, useState } from "react";
import { XmlComparison } from "./components/XmlComparison";
import XmlEditor from "./components/XmlEditor";
import BulkXmlEditor from "./components/BulkXmlEditor";

type ViewMode = "comparison" | "editor";
type EditorMode = "normal" | "bulk";

function App() {
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

  // Render main layout and show editor or comparison content inside it
  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
        <div className="flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setCurrentView("comparison")}
            className={`px-4 py-2 text-sm font-semibold transition ${
              currentView === "comparison"
                ? "border-b-2 border-primary text-primary"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            XML Comparison
          </button>
          <button
            onClick={() => setCurrentView("editor")}
            className={`px-4 py-2 text-sm font-semibold transition ${
              currentView === "editor"
                ? "border-b-2 border-primary text-primary"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            XML Editor
          </button>
        </div>

        {currentView === "comparison" && <XmlComparison />}
        {currentView === "editor" && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2 border-b border-slate-200 pb-2">
              <button
                onClick={() => setEditorMode("normal")}
                className={`px-3 py-1.5 text-xs font-semibold transition ${
                  editorMode === "normal"
                    ? "rounded-md bg-[#2596be] text-white"
                    : "rounded-md text-slate-600 hover:bg-slate-100"
                }`}
              >
                Normal XML Editor
              </button>
              <button
                onClick={() => setEditorMode("bulk")}
                className={`px-3 py-1.5 text-xs font-semibold transition ${
                  editorMode === "bulk"
                    ? "rounded-md bg-[#2596be] text-white"
                    : "rounded-md text-slate-600 hover:bg-slate-100"
                }`}
              >
                Bulk XML Editor
              </button>
            </div>
            {editorMode === "normal" ? <XmlEditor /> : <BulkXmlEditor />}
          </div>
        )}

        <footer className="mt-8 border-t border-slate-200 pt-6 pb-4 text-center text-xs text-slate-500">
          <p className="mb-2">
            FemtoXML Studio — Professional XML Comparator & Editor for RAN
            engineers
          </p>
          <p className="mb-2">
            © {new Date().getFullYear()} FemtoXML Studio. Developed by{" "}
            <a
              href="https://www.linkedin.com/in/bhuiamh/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-slate-600 hover:text-slate-900 underline transition"
            >
              Mahmudul Hasan Bhuia
            </a>
          </p>
          <p className="text-slate-400">
            Open-source XML comparison and editing tool
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
