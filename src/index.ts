#!/usr/bin/env node

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import fetch from 'node-fetch';

// Parse command line arguments
const argv = await yargs(hideBin(process.argv))
  .option('token', {
    alias: 't',
    type: 'string',
    description: 'Miro OAuth token'
  })
  .help()
  .argv;

// Get token with precedence: command line > environment variable
const oauthToken = (argv.token as string) || process.env.MIRO_OAUTH_TOKEN;

if (!oauthToken) {
  console.error('Error: Miro OAuth token is required. Provide it via MIRO_OAUTH_TOKEN environment variable or --token argument');
  process.exit(1);
}

interface MiroBoard {
  id: string;
  name: string;
  description?: string;
}

interface MiroBoardsResponse {
  data: MiroBoard[];
  total: number;
  size: number;
  offset: number;
}

interface MiroItem {
  id: string;
  type: string;
  [key: string]: any;
}

interface MiroItemsResponse {
  data: MiroItem[];
  cursor?: string;
}

class MiroClient {
  constructor(private token: string) {}

  private async fetchApi(path: string, options: { method?: string; body?: any } = {}) {
    const response = await fetch(`https://api.miro.com/v2${path}`, {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    
    if (!response.ok) {
      throw new Error(`Miro API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getBoards(): Promise<MiroBoard[]> {
    const response = await this.fetchApi('/boards') as MiroBoardsResponse;
    return response.data;
  }

  async getBoardItems(boardId: string): Promise<MiroItem[]> {
    const response = await this.fetchApi(`/boards/${boardId}/items`) as MiroItemsResponse;
    return response.data;
  }

  async createStickyNote(boardId: string, data: any): Promise<MiroItem> {
    return this.fetchApi(`/boards/${boardId}/sticky_notes`, {
      method: 'POST',
      body: data
    }) as Promise<MiroItem>;
  }

  async bulkCreateItems(boardId: string, items: any[]): Promise<MiroItem[]> {
    const response = await fetch(`https://api.miro.com/v2/boards/${boardId}/items/bulk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(items)
    });
    
    if (!response.ok) {
      const error = await response.json() as { message?: string };
      throw new Error(`Miro API error: ${error.message || response.statusText}`);
    }

    const result = await response.json() as { data: MiroItem[] };
    return result.data || [];
  }
}

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "mcp-miro",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

const miroClient = new MiroClient(oauthToken);

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const boards = await miroClient.getBoards();
  
  return {
    resources: boards.map(board => ({
      uri: `miro://board/${board.id}`,
      mimeType: "application/json",
      name: board.name,
      description: board.description || `Miro board: ${board.name}`
    }))
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);
  
  if (!request.params.uri.startsWith('miro://board/')) {
    throw new Error('Invalid Miro resource URI - must start with miro://board/');
  }

  const boardId = url.pathname.substring(1); // Remove leading slash from pathname
  const items = await miroClient.getBoardItems(boardId);

  return {
    contents: [{
      uri: request.params.uri,
      mimeType: "application/json",
      text: JSON.stringify(items, null, 2)
    }]
  };
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_boards",
        description: "List all available Miro boards and their IDs",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "create_sticky_note",
        description: "Create a sticky note on a Miro board",
        inputSchema: {
          type: "object",
          properties: {
            boardId: {
              type: "string",
              description: "ID of the board to create the sticky note on"
            },
            content: {
              type: "string",
              description: "Text content of the sticky note"
            },
            color: {
              type: "string",
              description: "Color of the sticky note (e.g. 'yellow', 'blue', 'pink')",
              default: "yellow"
            },
            x: {
              type: "number",
              description: "X coordinate position",
              default: 0
            },
            y: {
              type: "number",
              description: "Y coordinate position",
              default: 0
            }
          },
          required: ["boardId", "content"]
        }
      },
      {
        name: "bulk_create_items",
        description: "Create multiple items on a Miro board in a single transaction (max 20 items)",
        inputSchema: {
          type: "object",
          properties: {
            boardId: {
              type: "string",
              description: "ID of the board to create the items on"
            },
            items: {
              type: "array",
              description: "Array of items to create",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["app_card", "text", "shape", "sticky_note", "image", "document", "card", "frame", "embed"],
                    description: "Type of item to create"
                  },
                  data: {
                    type: "object",
                    description: "Item-specific data configuration"
                  },
                  style: {
                    type: "object",
                    description: "Item-specific style configuration"
                  },
                  position: {
                    type: "object",
                    description: "Item position configuration"
                  },
                  geometry: {
                    type: "object",
                    description: "Item geometry configuration"
                  },
                  parent: {
                    type: "object",
                    description: "Parent item configuration"
                  }
                },
                required: ["type"]
              },
              minItems: 1,
              maxItems: 20
            }
          },
          required: ["boardId", "items"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "list_boards": {
      const boards = await miroClient.getBoards();
      return {
        content: [{
          type: "text",
          text: JSON.stringify(boards.map(b => ({
            id: b.id,
            name: b.name
          })), null, 2)
        }]
      };
    }

    case "create_sticky_note": {
      const { boardId, content, color = "yellow", x = 0, y = 0 } = request.params.arguments as any;
      
      const stickyNote = await miroClient.createStickyNote(boardId, {
        data: {
          content: content
        },
        style: {
          fillColor: color
        },
        position: {
          x: x,
          y: y
        }
      });

      return {
        content: [{
          type: "text",
          text: `Created sticky note ${stickyNote.id} on board ${boardId}`
        }]
      };
    }

    case "bulk_create_items": {
      const { boardId, items } = request.params.arguments as any;
      
      const createdItems = await miroClient.bulkCreateItems(boardId, items);

      return {
        content: [{
          type: "text",
          text: `Created ${createdItems.length} items on board ${boardId}`
        }]
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
