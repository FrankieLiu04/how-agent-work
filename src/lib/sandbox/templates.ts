/**
 * Default templates for sandbox initialization
 */

export interface SandboxTemplate {
  path: string;
  content: string;
  isDir: boolean;
}

export const DEFAULT_SANDBOX_TEMPLATE: SandboxTemplate[] = [
  // Root directories
  { path: "/src", content: "", isDir: true },
  { path: "/docs", content: "", isDir: true },

  // Default files
  {
    path: "/package.json",
    content: JSON.stringify(
      {
        name: "sandbox-project",
        version: "1.0.0",
        description: "A virtual sandbox project",
        main: "src/index.js",
        scripts: {
          start: "node src/index.js",
          test: "echo 'No tests specified'",
        },
        keywords: [],
        author: "",
        license: "MIT",
      },
      null,
      2
    ),
    isDir: false,
  },
  {
    path: "/src/index.js",
    content: `// Welcome to your sandbox project!
// This is the main entry point of your application.

console.log("Hello from sandbox!");

// TODO: Start building your application here
`,
    isDir: false,
  },
  {
    path: "/README.md",
    content: `# Sandbox Project

Welcome to your virtual sandbox environment!

## Getting Started

This is a virtual file system where you can:
- Create and edit files
- Organize code in directories
- Test your ideas

## File Limits

- Maximum 20 files
- Maximum 5KB per file
- Maximum 100KB total storage

## Available Commands (CLI Mode)

\`\`\`bash
ls      # List files
cd      # Change directory
pwd     # Print working directory
cat     # Display file content
mkdir   # Create directory
touch   # Create empty file
rm      # Remove file/directory
grep    # Search in files
find    # Find files by name
\`\`\`

Happy coding!
`,
    isDir: false,
  },
];

/**
 * Calculate the byte size of content
 */
export function calculateSize(content: string): number {
  return new TextEncoder().encode(content).length;
}

/**
 * Get templates with calculated sizes
 */
export function getTemplatesWithSizes(): Array<SandboxTemplate & { size: number }> {
  return DEFAULT_SANDBOX_TEMPLATE.map((t) => ({
    ...t,
    size: t.isDir ? 0 : calculateSize(t.content),
  }));
}
