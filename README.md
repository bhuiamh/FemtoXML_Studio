# FemtoXML Studio

**Professional XML comparison and editing tool designed for RAN Engineers**

A robust, high-performance web application for comparing and editing large-scale XML device configurations. Optimized to handle XML files with large parameters efficiently using Web Workers and virtual scrolling.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-All%20Rights%20Reserved-red)

## 🚀 Features

### XML Comparison Module
- **Large-Scale Processing**: Handles XML files with large parameters efficiently
- **Web Worker Architecture**: Comparison runs in background threads, keeping UI responsive
- **Real-time Progress**: Live progress bar with percentage during comparison
- **Smart Filtering**:
  - Filter by change type (Added, Removed, Changed)
  - Quick "Added only" toggle
  - Value-only view mode
  - Full-text search across paths and values
- **Virtualized Results**: Only renders visible rows for optimal performance
- **Export Capabilities**:
  - Export to CSV (Google Sheets compatible)
  - Export to Excel (.xlsx format, no page numbers)
- **File Management**: Upload XML files or paste directly
- **Detailed Statistics**: Shows counts for Added, Removed, and Changed parameters

### XML Editor Module
- **Normal XML Editor**:
  - **Tree-based Editing**: Hierarchical view of XML structure
  - **Full Search**: Search across parameter name, full path, value, and attributes
  - **Edit Values**: Modify text content of any XML node
  - **Edit Attributes**: Add, modify, or remove node attributes
  - **Duplicate Path Feature**: Clone parent paths with all children (e.g., duplicate i1 to create i2 with same structure)
  - **Delete Nodes**: Remove unwanted XML elements
  - **Undo/Redo System**: Full history support with 50-state undo/redo capability
  - **Expand/Collapse**: Navigate large XML structures easily
  - **Context-Aware View**: Hides internal helper sections like `Notification` and `AccessList` for a cleaner tree
  - **Download Edited XML**: Export your modifications

- **Bulk XML Editor**:
  - **Excel-Driven Updates**: Apply changes to the XML using an Excel file
  - **Two-Column Excel Format**: `Parameter path` and `Value`
  - **Flexible Path Syntax**: Dots or slashes (`Root.Section.Param` or `Root/Section/Param`), optional indices (`Param[2]`)
  - **Full Path Support**: Also accepts full internal paths like `root[1].section[1].param[2]`
  - **Result Summary**: Shows which paths were updated and which were not found
  - **Bulk Download**: Export the bulk-edited XML in a single click

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- npm 9.0.0 or higher
- Modern web browser (Chrome, Firefox, Edge, Safari)

## 🛠️ Installation

1. **Clone or download the repository**
   ```bash
   cd xml-comparison
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

   If you encounter PowerShell execution policy issues on Windows:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   npm install
   ```

## ▶️ Running the Application

### Development Mode
```bash
npm run dev
```

The application will start on `http://localhost:5173`

### Production Build
```bash
npm run build
npm run preview
```

### Linting
```bash
npm run lint
```

## 📖 Usage Guide

### XML Comparison

1. **Upload XML Files**:
   - Click "Load file" for Left XML
   - Click "Load file" for Right XML
   - Or paste XML content directly into the text areas

2. **Compare**:
   - Click the "Compare" button
   - Watch the progress bar as comparison runs
   - Results appear in the Differences table

3. **Filter Results**:
   - Use toggle buttons to show/hide Added, Removed, or Changed items
   - Click "Added only" for quick filter
   - Use "Value-only view" to hide irrelevant columns
   - Search bar filters results in real-time

4. **Export Results**:
   - Click "Export CSV" for Google Sheets compatible format
   - Click "Export Excel" for Excel file format

### XML Editor (Normal & Bulk)

1. **Select Editor Mode**:
   - Go to the **XML Editor** tab
   - Use the **Normal XML Editor / Bulk XML Editor** toggle to choose the mode

2. **Load XML**:
   - Click "Load XML File" and select your XML file

3. **Normal XML Editor**:
   - **Edit Values**: Click on any text input field and modify values
   - **Edit Attributes**: Modify attribute values in the blue attribute boxes
   - **Duplicate Path**: Click "Duplicate" button on any node to clone it with all children
   - **Delete**: Click "Delete" to remove a node
   - **Search**: Use the search bar to find nodes by parameter name, full path, value, or attribute

4. **Navigate**:
   - Click expand/collapse arrows (▶/▼) to view children
   - Scroll through large XML structures

5. **Undo/Redo**:
   - Click "↶ Undo" to revert last action
   - Click "↷ Redo" to reapply undone action
   - Supports up to 50 history states

6. **Download**:
   - Click "Download Edited XML" to save your changes

7. **Bulk XML Editing**:
   - Switch to **Bulk XML Editor** mode in the XML Editor tab
   - Load the same XML file
   - Load an Excel file with two columns:
     - **Parameter path**: e.g. `Root.Section.Param`, `Root/Section/Param`, or `Root[1].Section[1].Param[2]`
     - **Value**: New value to write into the XML
   - Click **"Apply Excel to XML"** to apply all changes
   - Review the result summary (Updated / Not found)
   - Click **"Download Edited XML"** to save the bulk-edited XML

## 🎨 Color Scheme

The application uses a professional color palette:
- **Primary Color**: `#2596be` (Teal Blue)
- **Accent Colors**: Custom shades of the primary color for highlights and interactions

## 🏗️ Technical Architecture

### Technologies Used
- **React 18.3.1**: Modern UI framework
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **xml-js**: XML parsing and generation
- **@tanstack/react-virtual**: Virtual scrolling for performance
- **xlsx**: Excel file generation
- **Web Workers**: Background processing for XML comparison

### Performance Optimizations
- Web Workers for non-blocking XML parsing and comparison
- Virtual scrolling for rendering large result sets
- Memoized computations for filtered results
- Efficient diff algorithm for large XML structures

### File Structure
```
xml-comparison/
├── src/
│   ├── components/
│   │   └── XmlEditor.tsx      # XML Editor component
│   ├── utils/
│   │   └── export.ts          # CSV/Excel export utilities
│   ├── workers/
│   │   └── xmlDiffWorker.ts   # Web Worker for XML comparison
│   ├── App.tsx                # Main application component
│   ├── main.tsx               # Application entry point
│   └── index.css              # Global styles
├── public/                    # Static assets
├── package.json               # Dependencies and scripts
├── tailwind.config.cjs        # Tailwind configuration
├── vite.config.ts             # Vite configuration
└── README.md                  # This file
```

## 🔧 Configuration

### Customizing Colors
Edit `tailwind.config.cjs` to modify the primary color scheme:

```javascript
colors: {
  primary: {
    DEFAULT: '#2596be',  // Change this for your brand color
    // ... other shades
  }
}
```

### Adjusting Worker Performance
Modify progress reporting intervals in `src/workers/xmlDiffWorker.ts` if needed.

## 🐛 Troubleshooting

### npm install fails on Windows
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
npm install
```

### Port already in use
Modify `vite.config.ts` to use a different port:
```typescript
server: {
  port: 3000  // Change to your preferred port
}
```

### Large XML files cause memory issues
- Ensure sufficient browser memory
- Consider processing files in smaller batches
- Check browser console for specific error messages

## 📝 License

© 2026 All Rights Reserved by [Mahmudul Hasan Bhuia](https://www.linkedin.com/in/bhuiamh/)

This software is proprietary. Unauthorized copying, modification, distribution, or use is strictly prohibited.

## 👥 Credits

**[Mahmudul Hasan Bhuia](https://www.linkedin.com/in/bhuiamh/)** | RAN Engineer | NYBSYS Inc.

**Developed for RAN Engineers**

### Technologies & Libraries
- [React](https://react.dev/) - UI Framework
- [Vite](https://vitejs.dev/) - Build Tool
- [Tailwind CSS](https://tailwindcss.com/) - CSS Framework
- [xml-js](https://www.npmjs.com/package/xml-js) - XML Processing
- [@tanstack/react-virtual](https://tanstack.com/virtual) - Virtual Scrolling
- [xlsx](https://www.npmjs.com/package/xlsx) - Excel Generation

## 📧 Support

For issues, questions, or feature requests, please contact your development team.

---

**Version**: 1.0.0  
**Last Updated**: January 28, 2026  
**Target Audience**: RAN Engineers, Network Configuration Specialists

