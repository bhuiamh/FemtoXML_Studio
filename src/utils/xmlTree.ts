/**
 * Shared XML editable tree types and helpers for editor and bulk editor.
 */

export type EditableNode = {
  id: string;
  path: string;
  name: string;
  value: string;
  attributes: Record<string, string>;
  isText: boolean;
  children: EditableNode[];
};

export function buildEditableTree(
  elements: any[] | undefined,
  path: string = "",
  parentPath: string = "",
): EditableNode[] {
  if (!elements) return [];

  const result: EditableNode[] = [];
  const siblingCounts: Record<string, number> = {};

  elements.forEach((el) => {
    if (el.type !== "element") return;

    const name = el.name || "unnamed";
    const count = (siblingCounts[name] || 0) + 1;
    siblingCounts[name] = count;
    const currentPath = path
      ? `${path}.${name}[${count}]`
      : `${name}[${count}]`;
    const id = currentPath;
    const fullParentPath = parentPath ? `${parentPath}.${name}` : name;

    const textNodes =
      el.elements?.filter(
        (n: any) => n.type === "text" || n.type === "cdata",
      ) || [];
    const textValue = textNodes
      .map((n: any) => n.text || "")
      .join("")
      .trim();

    const attributes = el.attributes || {};
    const childElements =
      el.elements?.filter((n: any) => n.type === "element") || [];
    const children = buildEditableTree(
      childElements,
      currentPath,
      fullParentPath,
    );

    result.push({
      id,
      path: currentPath,
      name,
      value: textValue,
      attributes,
      isText: true,
      children,
    });
  });

  return result;
}

export function buildXmlFromEditable(nodes: EditableNode[]): any[] {
  return nodes.map((node) => {
    const element: any = {
      type: "element",
      name: node.name,
    };

    if (Object.keys(node.attributes).length > 0) {
      element.attributes = node.attributes;
    }

    element.elements = [];
    if (node.value) {
      element.elements.push({ type: "text", text: node.value });
    }

    if (node.children.length > 0) {
      element.elements.push(...buildXmlFromEditable(node.children));
    }

    return element;
  });
}

/** Parse a parameter path segment: "name" or "name[1]" -> { name, index?: number } */
function parsePathSegment(segment: string): { name: string; index?: number } {
  const match = segment.trim().match(/^(.+?)(?:\[(\d+)\])?$/);
  if (!match) return { name: segment.trim() };
  const [, name, indexStr] = match;
  return {
    name: name ?? segment.trim(),
    index: indexStr != null ? parseInt(indexStr, 10) : undefined,
  };
}

/**
 * Find a node by parameter path. Path can use . or / separators.
 * Each segment can be "tagName" or "tagName[1-basedIndex]".
 * Also supports exact match by internal id (e.g. "root[1].child[1].param[1]").
 */
export function findNodeByParameterPath(
  nodes: EditableNode[],
  pathStr: string,
): EditableNode | null {
  const normalized = pathStr.trim().replace(/\//g, ".").replace(/\.+/g, ".");
  if (!normalized) return null;

  // Exact id match first (internal format: name[1].name2[2])
  for (const node of nodes) {
    if (node.id === pathStr.trim()) return node;
    const found = findNodeByParameterPath(node.children, pathStr);
    if (found) return found;
  }

  const segments = normalized.split(".").filter(Boolean);
  if (segments.length === 0) return null;

  function walk(nodes: EditableNode[], segmentIndex: number): EditableNode | null {
    if (segmentIndex >= segments.length) return null;
    const { name, index } = parsePathSegment(segments[segmentIndex]);
    const isLast = segmentIndex === segments.length - 1;

    const sameName = nodes.filter((n) => n.name === name);
    if (sameName.length === 0) return null;

    const target =
      index != null && index >= 1
        ? sameName[index - 1] ?? sameName[0]
        : sameName[0];

    if (isLast) return target;
    return walk(target.children, segmentIndex + 1);
  }

  return walk(nodes, 0);
}

/**
 * Apply a value to the node at the given path. Mutates the tree.
 * Returns true if the path was found and updated.
 */
export function setNodeValueByPath(
  nodes: EditableNode[],
  pathStr: string,
  value: string,
): boolean {
  const node = findNodeByParameterPath(nodes, pathStr);
  if (!node) return false;
  node.value = value;
  return true;
}
