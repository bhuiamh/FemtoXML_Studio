import { useState, useEffect, useRef, useCallback } from "react";
import { xml2js, js2xml } from "xml-js";
import {
  type EditableNode,
  buildEditableTree,
  buildXmlFromEditable,
} from "../utils/xmlTree";

type XmlEditorProps = {
  onNavigateToComparison?: () => void;
};

function deepCloneNode(node: EditableNode): EditableNode {
  return {
    ...node,
    attributes: { ...node.attributes },
    children: node.children.map(deepCloneNode),
  };
}

function findNodeById(nodes: EditableNode[], id: string): EditableNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

function findParentNodes(
  nodes: EditableNode[],
  targetId: string,
  parentList: EditableNode[] = [],
): EditableNode[] | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return parentList;
    }
    const found = findParentNodes(node.children, targetId, [
      ...parentList,
      node,
    ]);
    if (found) return found;
  }
  return null;
}

function regenerateIds(
  nodes: EditableNode[],
  parentPath: string = "",
  siblingCounts: Record<string, number> = {},
): EditableNode[] {
  return nodes.map((node) => {
    const name = node.name;
    const count = (siblingCounts[name] || 0) + 1;
    siblingCounts[name] = count;
    const currentPath = parentPath
      ? `${parentPath}.${name}[${count}]`
      : `${name}[${count}]`;

    return {
      ...node,
      id: currentPath,
      path: currentPath,
      children: regenerateIds(node.children, currentPath, {}),
    };
  });
}

export default function XmlEditor({ onNavigateToComparison }: XmlEditorProps) {
  const [xmlContent, setXmlContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<EditableNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<EditableNode[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchMode, setSearchMode] = useState<"parameter" | "path" | "value">(
    "parameter",
  );
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Undo/Redo system
  const historyRef = useRef<EditableNode[][]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const saveToHistory = useCallback((newTree: EditableNode[]) => {
    const history = historyRef.current;
    const index = historyIndexRef.current;

    // Remove any history after current index (when new action after undo)
    const newHistory = history.slice(0, index + 1);
    newHistory.push(newTree.map(deepCloneNode));

    // Limit history size to 50 states
    if (newHistory.length > 50) {
      newHistory.shift();
    } else {
      historyIndexRef.current = newHistory.length - 1;
    }

    historyRef.current = newHistory;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    const history = historyRef.current;
    const index = historyIndexRef.current;

    if (index > 0) {
      historyIndexRef.current = index - 1;
      setTree(history[index - 1].map(deepCloneNode));
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(true);
    }
  }, []);

  const redo = useCallback(() => {
    const history = historyRef.current;
    const index = historyIndexRef.current;

    if (index < history.length - 1) {
      historyIndexRef.current = index + 1;
      setTree(history[index + 1].map(deepCloneNode));
      setCanUndo(true);
      setCanRedo(historyIndexRef.current < history.length - 1);
    }
  }, []);

  useEffect(() => {
    if (!xmlContent.trim()) {
      setTree([]);
      setError(null);
      historyRef.current = [];
      historyIndexRef.current = -1;
      setCanUndo(false);
      setCanRedo(false);
      return;
    }

    try {
      const parsed = xml2js(xmlContent, {
        compact: false,
        ignoreDeclaration: true,
      });
      const rootElements = (parsed as any).elements || [];
      const editableTree = buildEditableTree(rootElements);
      setTree(editableTree);
      setError(null);
      // Auto-expand first level
      if (editableTree.length > 0 && expandedPaths.size === 0) {
        setExpandedPaths(new Set(editableTree.map((n) => n.id)));
      }
      // Save initial state to history
      saveToHistory(editableTree);
    } catch (err) {
      setError((err as Error).message);
      setTree([]);
    }
  }, [xmlContent, saveToHistory]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        if (canRedo) redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  const handleFileLoad = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result?.toString() ?? "";
      setXmlContent(content);
      setIsLoading(false);
    };
    reader.onerror = () => {
      setError("Failed to read file");
      setIsLoading(false);
    };
    reader.readAsText(file);
  };

  const updateNodeValue = (id: string, value: string) => {
    const update = (nodes: EditableNode[]): EditableNode[] => {
      return nodes.map((node) => {
        if (node.id === id) {
          return { ...node, value };
        }
        return { ...node, children: update(node.children) };
      });
    };
    const newTree = update(tree);
    setTree(newTree);
    saveToHistory(newTree);
  };

  const updateNodeAttribute = (
    id: string,
    attrName: string,
    attrValue: string,
  ) => {
    const update = (nodes: EditableNode[]): EditableNode[] => {
      return nodes.map((node) => {
        if (node.id === id) {
          const newAttrs = { ...node.attributes };
          if (attrValue.trim()) {
            newAttrs[attrName] = attrValue;
          } else {
            delete newAttrs[attrName];
          }
          return { ...node, attributes: newAttrs };
        }
        return { ...node, children: update(node.children) };
      });
    };
    const newTree = update(tree);
    setTree(newTree);
    saveToHistory(newTree);
  };

  const deleteNode = (id: string) => {
    const remove = (nodes: EditableNode[]): EditableNode[] => {
      return nodes
        .filter((node) => node.id !== id)
        .map((node) => ({ ...node, children: remove(node.children) }));
    };
    const newTree = remove(tree);
    setTree(newTree);
    saveToHistory(newTree);
  };

  const duplicatePath = (id: string) => {
    const sourceNode = findNodeById(tree, id);
    if (!sourceNode) return;

    // Find parent nodes to determine insertion point
    const parentList = findParentNodes(tree, id);
    if (parentList === null) {
      // Root level node
      const duplicated = deepCloneNode(sourceNode);
      // Extract base name and numeric suffix (e.g., "i" and 1 from "i1")
      const nameMatch = sourceNode.name.match(/^(.*?)(\d+)?$/);
      const baseName = nameMatch?.[1] ?? sourceNode.name;
      const siblings = tree.filter((n) => {
        const m = n.name.match(/^(.*?)(\d+)?$/);
        return m?.[1] === baseName;
      });
      const numbers = siblings.map((n) => {
        const m = n.name.match(/^(.*?)(\d+)$/);
        return m ? parseInt(m[2], 10) : 0;
      });
      const nextNum = Math.max(0, ...numbers) + 1;
      duplicated.name = `${baseName}${nextNum}`;
      // Regenerate IDs for the duplicated subtree
      const newTree = [...tree, duplicated];
      const regenerated = regenerateIds(newTree);
      setTree(regenerated);
      saveToHistory(regenerated);
    } else {
      // Child node
      const parent = parentList[parentList.length - 1];
      const update = (nodes: EditableNode[]): EditableNode[] => {
        return nodes.map((node) => {
          if (node.id === parent.id) {
            const duplicated = deepCloneNode(sourceNode);
            const nameMatch = sourceNode.name.match(/^(.*?)(\d+)?$/);
            const baseName = nameMatch?.[1] ?? sourceNode.name;
            const siblings = node.children.filter((n) => {
              const m = n.name.match(/^(.*?)(\d+)?$/);
              return m?.[1] === baseName;
            });
            const numbers = siblings.map((n) => {
              const m = n.name.match(/^(.*?)(\d+)$/);
              return m ? parseInt(m[2], 10) : 0;
            });
            const nextNum = Math.max(0, ...numbers) + 1;
            duplicated.name = `${baseName}${nextNum}`;
            const newChildren = [...node.children, duplicated];
            // Regenerate IDs for parent's children
            const regeneratedChildren = regenerateIds(newChildren, node.path);
            return { ...node, children: regeneratedChildren };
          }
          return { ...node, children: update(node.children) };
        });
      };
      const newTree = update(tree);
      const regenerated = regenerateIds(newTree);

    // Expand the duplicated node
    const duplicatedNode = findNodeById(tree, id);
    if (duplicatedNode) {
      setExpandedPaths(new Set([...expandedPaths, duplicatedNode.id]));
    }
      setTree(regenerated);
      saveToHistory(regenerated);
    }
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedPaths(newExpanded);
  };

  const handleDownload = () => {
    try {
      const xmlElements = buildXmlFromEditable(tree);
      const xmlObj = { elements: xmlElements };
      const xmlString = js2xml(xmlObj, { compact: false, spaces: 2 });
      const blob = new Blob([xmlString], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName ? `edited-${fileName}` : "edited.xml";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Failed to generate XML: ${(err as Error).message}`);
    }
  };

  const currentSearchMatchId =
    searchResults.length > 0 && searchIndex >= 0 && searchIndex < searchResults.length
      ? searchResults[searchIndex].id
      : null;

  const focusNode = (targetId: string) => {
    const parents = findParentNodes(tree, targetId) ?? [];
    const newExpanded = new Set(expandedPaths);
    parents.forEach((p) => newExpanded.add(p.id));
    newExpanded.add(targetId);
    setExpandedPaths(newExpanded);
  };

  const runSearch = () => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      setSearchResults([]);
      setSearchIndex(0);
      setIsSearchModalOpen(false);
      return;
    }

    const allNodes: EditableNode[] = [];
    const collect = (nodes: EditableNode[]) => {
      nodes.forEach((n) => {
        allNodes.push(n);
        if (n.children.length > 0) collect(n.children);
      });
    };
    collect(tree);

    const matches = allNodes.filter((n) => {
      const name = n.name.toLowerCase();
      const cleanPath = n.path.replace(/\[\d+\]/g, "").toLowerCase();
      const value = n.value.toLowerCase();

      if (searchMode === "parameter") {
        return name.includes(query);
      }

      if (searchMode === "path") {
        return cleanPath.includes(query);
      }

      if (searchMode === "value") {
        return value.includes(query);
      }

      return false;
    });

    setSearchResults(matches);
    setSearchIndex(0);
    if (matches[0]) {
      focusNode(matches[0].id);
    }
    if (matches.length > 0) {
      setIsSearchModalOpen(true);
    } else {
      setIsSearchModalOpen(false);
    }
  };

  const goToSearchResult = (direction: "prev" | "next") => {
    if (searchResults.length === 0) return;
    let nextIndex = searchIndex;
    if (direction === "next") {
      nextIndex = (searchIndex + 1) % searchResults.length;
    } else {
      nextIndex = (searchIndex - 1 + searchResults.length) % searchResults.length;
    }
    setSearchIndex(nextIndex);
    const target = searchResults[nextIndex];
    if (target) {
      focusNode(target.id);
    }
  };

  // const renderNode = (node: EditableNode, level: number = 0) => {
  //   if (
  //     node.name === "Notification" ||
  //     node.name === "AccessList" ||
  //     (node.value.trim() === "" && node.children.length === 0)
  //   ) {
  //     return null;
  //   }
  //   const hasChildren = node.children.length > 0;
  //   const isExpanded = expandedPaths.has(node.id);
  //   const isActiveMatch = currentSearchMatchId === node.id;

  //   return (
  //     <div
  //       key={node.id}
  //       className={`select-none ${isActiveMatch ? "bg-yellow-50" : ""}`}
  //     >
  //       <div
  //         className="flex items-center gap-2 border-b border-slate-100 p-2 hover:bg-slate-50"
  //         style={{ paddingLeft: `${level * 20 + 8}px` }}
  //       >
  //         {hasChildren && (
  //           <button
  //             onClick={() => toggleExpand(node.id)}
  //             className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600"
  //           >
  //             {isExpanded ? "▼" : "▶"}
  //           </button>
  //         )}
  //         {!hasChildren && <div className="w-5" />}

  //         <span className="font-mono text-sm font-semibold text-slate-700">
  //           {node.name}
  //         </span>

  //         <div className="ml-2 flex-1">
  //           <input
  //             type="text"
  //             value={node.value}
  //             onChange={(e) => updateNodeValue(node.id, e.target.value)}
  //             placeholder=""
  //             className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono focus:border-[#2596be] focus:outline-none focus:ring-1 focus:ring-[#2596be]"
  //           />
  //         </div>

  //         <div className="flex gap-1">
  //           {Object.entries(node.attributes).map(([key, val]) => (
  //             <div
  //               key={key}
  //               className="flex items-center gap-1 rounded bg-[#2596be]/10 px-2 py-0.5 text-xs"
  //             >
  //               <span className="font-semibold text-[#2596be]">{key}=</span>
  //               <input
  //                 type="text"
  //                 value={val}
  //                 onChange={(e) =>
  //                   updateNodeAttribute(node.id, key, e.target.value)
  //                 }
  //                 className="w-20 rounded border border-[#2596be]/20 bg-white px-1 py-0.5 text-xs focus:border-[#2596be] focus:outline-none"
  //               />
  //             </div>
  //           ))}
  //         </div>

  //         <button
  //           onClick={() => duplicatePath(node.id)}
  //           className="rounded px-2 py-1 text-xs text-[#2596be] hover:bg-[#2596be]/10"
  //           title="Duplicate this path with all children"
  //         >
  //           Duplicate
  //         </button>

  //         <button
  //           onClick={() => deleteNode(node.id)}
  //           className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
  //         >
  //           Delete
  //         </button>
  //       </div>

  //       {hasChildren && isExpanded && (
  //         <div>
  //           {node.children.map((child) => renderNode(child, level + 1))}
  //         </div>
  //       )}
  //     </div>
  //   );
  // };

  const renderNode = (node: EditableNode, level: number = 0) => {
    // Skip rendering completely empty leaf nodes
    // (we no longer check node.name === "Notification" || "AccessList" here)
    if (node.value.trim() === "" && node.children.length === 0) {
      return null;
    }
  
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedPaths.has(node.id);
    const isActiveMatch = currentSearchMatchId === node.id;
  
    // Filter out unwanted attributes (Notification and AccessList)
    const visibleAttributes = Object.entries(node.attributes).filter(
      ([key]) => key !== "Notification" && key !== "AccessList"
    );
  
    return (
      <div
        key={node.id}
        className={`select-none ${isActiveMatch ? "bg-yellow-50" : ""}`}
      >
        <div
          className="flex items-center gap-2 border-b border-slate-100 p-2 hover:bg-slate-50 transition-colors"
          style={{ paddingLeft: `${level * 20 + 8}px` }}
        >
          {/* Expander icon or spacer */}
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(node.id)}
              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600 focus:outline-none"
            >
              {isExpanded ? "▼" : "▶"}
            </button>
          ) : (
            <div className="w-5" />
          )}
  
          {/* Node name */}
          <span className="font-mono text-sm font-semibold text-slate-700 min-w-[100px]">
            {node.name}
          </span>
  
          {/* Value input */}
          <div className="ml-2 flex-1 min-w-0">
            <input
              type="text"
              value={node.value}
              onChange={(e) => updateNodeValue(node.id, e.target.value)}
              placeholder="..."
              spellCheck={false}
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono focus:border-[#2596be] focus:outline-none focus:ring-1 focus:ring-[#2596be]/50"
            />
          </div>
  
          {/* Visible attributes only */}
          {visibleAttributes.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {visibleAttributes.map(([key, val]) => (
                <div
                  key={key}
                  className="flex items-center gap-1 rounded bg-[#2596be]/10 px-2 py-0.5 text-xs whitespace-nowrap"
                >
                  <span className="font-semibold text-[#2596be]">{key}=</span>
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => updateNodeAttribute(node.id, key, e.target.value)}
                    spellCheck={false}
                    className="w-20 rounded border border-[#2596be]/20 bg-white px-1.5 py-0.5 text-xs focus:border-[#2596be] focus:outline-none focus:ring-1 focus:ring-[#2596be]/40"
                  />
                </div>
              ))}
            </div>
          )}
  
          {/* Actions */}
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => duplicatePath(node.id)}
              className="rounded px-2 py-1 text-xs text-[#2596be] hover:bg-[#2596be]/10 transition-colors"
              title="Duplicate this path with all children"
            >
              Duplicate
            </button>
  
            <button
              onClick={() => deleteNode(node.id)}
              className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
  
        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {node.children.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">XML Editor</h1>
          <p className="mt-1 text-sm text-slate-600">
            Upload, edit, and download XML files
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex gap-2">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Undo (Ctrl+Z)"
            >
              ↶ Undo
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Redo (Ctrl+Y)"
            >
              ↷ Redo
            </button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            Load XML File
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml"
              onChange={handleFileLoad}
              className="hidden"
            />
          </label>
          <button
            onClick={handleDownload}
            disabled={tree.length === 0}
            className="rounded-lg bg-[#2596be] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e7a9a] disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            Download Edited XML
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              runSearch();
            }
          }}
          placeholder="Search by parameter name, full path, or value"
          className="min-w-[260px] flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-[#2596be] focus:outline-none focus:ring-1 focus:ring-[#2596be]"
        />
        <button
          onClick={runSearch}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Search
        </button>
        <button
          onClick={() => goToSearchResult("prev")}
          disabled={searchResults.length === 0}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Prev
        </button>
        <button
          onClick={() => goToSearchResult("next")}
          disabled={searchResults.length === 0}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
        <span className="ml-2 text-xs text-slate-500">
          {searchResults.length > 0
            ? `Match ${searchIndex + 1} of ${searchResults.length}`
            : "Type a query and press Enter or Search"}
        </span>
        <div className="ml-4 flex items-center gap-3 text-xs text-slate-600">
          <span className="font-medium">Search in:</span>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="searchMode"
              value="parameter"
              checked={searchMode === "parameter"}
              onChange={() => setSearchMode("parameter")}
            />
            <span>Parameter</span>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="searchMode"
              value="path"
              checked={searchMode === "path"}
              onChange={() => setSearchMode("path")}
            />
            <span>Full path</span>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="searchMode"
              value="value"
              checked={searchMode === "value"}
              onChange={() => setSearchMode("value")}
            />
            <span>Value</span>
          </label>
        </div>
      </div>

      {isLoading && (
        <div className="mb-4 rounded-lg bg-[#2596be]/10 p-4 text-center text-sm text-[#2596be]">
          Loading XML file...
        </div>
      )}

      {fileName && !isLoading && (
        <div className="mb-4 rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-700">
          <span className="font-medium">File:</span> {fileName}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {tree.length === 0 && !isLoading && !error && (
        <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <p className="mt-4 text-sm text-slate-600">
            Upload an XML file to start editing
          </p>
        </div>
      )}

      {tree.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="max-h-[600px] overflow-y-auto">
            {tree.map((node) => renderNode(node))}
          </div>
        </div>
      )}

      {isSearchModalOpen && searchResults.length > 0 && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40">
          <div className="max-h-[80vh] w-full max-w-4xl overfl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">
                  Search results ({searchResults.length})
                </h2>
                <p className="text-xs text-slate-500">
                  You can edit values directly here. Click Go to focus in the tree.
                </p>
              </div>
              <button
                onClick={() => setIsSearchModalOpen(false)}
                className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-700">
                      Full path
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-700">
                      Parameter
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-700">
                      Value
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((result) => {
                    const node = findNodeById(tree, result.id);
                    if (!node) return null;
                    const cleanPath = node.path.replace(/\[\d+\]/g, "");
                    return (
                      <tr key={result.id} className="border-b border-slate-100">
                        <td className="px-3 py-1.5 font-mono text-[11px] text-slate-800">
                          {cleanPath}
                        </td>
                        <td className="px-3 py-1.5 text-slate-700">{node.name}</td>
                        <td className="px-3 py-1.5">
                          <input
                            type="text"
                            value={node.value}
                            onChange={(e) =>
                              updateNodeValue(node.id, e.target.value)
                            }
                            className="w-full rounded border border-slate-300 px-2 py-1 text-[11px] font-mono focus:border-[#2596be] focus:outline-none focus:ring-1 focus:ring-[#2596be]"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            onClick={() => {
                              focusNode(node.id);
                              setIsSearchModalOpen(false);
                            }}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
                          >
                            Go to
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
