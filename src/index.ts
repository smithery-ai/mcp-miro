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

  private async fetchApi(path: string) {
    const response = await fetch(`https://api.miro.com/v2${path}`, {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
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
}

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "mcp-miro",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
