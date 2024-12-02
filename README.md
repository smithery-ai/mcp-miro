# mcp-miro MCP Server

A Model Context Protocol server to connect to the MIRO Whiteboard Application.

![MIRO/Claude Desktop Screenshot]([./2024-12-02-screenshot_1.png])

- Allows Board manipulation, sticky creation, bulk operations and more.
- Pass your OAuth key as an Environment Variable, or using the "--token" argument.

## Features

### Resources
- Get Board Contents 

### Tools
- Create Sticky, Shape
- Read Board, Frame, Contents
- Bulk Create

### Prompts
- Instruct on Board Coordinates etc.

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

![2024-12-02-screenshot_1](https://github.com/evalstate/mcp-miro/blob/main/2024-12-02-screenshot_1.png)


## Installation

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-miro": {
      "command": "/path/to/node-or-npx",
      "arguments": [
        "/path/to/mcp-miro/build/index.js",
        "--token","MIRO-OAUTH-KEY"
      ]
    }
  }
}
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.
