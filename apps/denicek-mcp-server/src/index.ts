import type { AnyDocumentId } from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
    type JsonDoc
} from "@mydenicek/core";
import { DENICEK_TOOLS, serializeDocument } from "@mydenicek/mcp";
import { executeToolAction, type DenicekToolName } from "./executor.js";

// Hack for WebSocket in Node environment (repo-network-websocket expects it global or passed)
// But BrowserWebSocketClientAdapter is strict about 'WebSocket' existence.
// We can use 'isomorphic-ws' or similar, but for now let's hope standard ws works if we polyfill.
import WebSocket from "isomorphic-ws";
// @ts-ignore
global.WebSocket = WebSocket;


const repo = new Repo({
    network: [new BrowserWebSocketClientAdapter("wss://sync.automerge.org/")],
  storage: new NodeFSStorageAdapter(".automerge-data")
});

const server = new Server(
    {
        name: "mydenicek-mcp-server",
        version: "0.1.0",
    },
    {
        capabilities: {
            resources: {},
            tools: {},
        },
    }
);

/**
 * List Resources: We treat specific Document URLs as resources.
 * In a real app, we might search the repo for all available docs.
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            // Example resource, in reality this claim is dynamic
            // {
            //     uri: "denicek://document/current",
            //     name: "Current Active Document",
            //     description: "The document currently loaded via tool parameters"
            // }
        ],
    };
});

// Helper to get doc handle
async function getDoc(docId: string) {
    // docId might be full URL "automerge:..." or just UUID
    // automerge-repo handles both in `find` usually, but let's be safe
    const handle = repo.find<JsonDoc>(docId as unknown as AnyDocumentId);
    await handle.whenReady();
    return handle;
}

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const url = request.params.uri;
    // We expect uri to be the automerge URL
    if (url.startsWith("automerge:")) {
        const handle = await getDoc(url);
        const doc = await handle.doc();
        if (!doc) throw new Error("Document not found");
        
        return {
            contents: [{
                uri: url,
                mimeType: "text/xml",
                text: serializeDocument(doc)
            }]
        };
    }
    throw new Error("Invalid URI scheme");
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Augment tools to require 'docId' for the stateless server context
    type DenicekTool = (typeof DENICEK_TOOLS)[number];
    type JsonSchemaObject = {
        type: "object";
        properties: Record<string, unknown>;
        required: string[];
    } & Record<string, unknown>;

    const augmentedTools = DENICEK_TOOLS.map((tool: DenicekTool) => {
        const schema = structuredClone(tool.function.parameters) as unknown;
        if (
            schema &&
            typeof schema === "object" &&
            (schema as Record<string, unknown>).type === "object"
        ) {
            const obj = schema as JsonSchemaObject;
            obj.properties["docId"] = {
                type: "string",
                description: "The Automerge URL or UUID of the document to edit."
            };
            obj.required = Array.isArray(obj.required) ? obj.required : [];
            if (!obj.required.includes("docId")) obj.required.push("docId");
        }
        return {
            name: tool.function.name,
            description: tool.function.description,
            inputSchema: schema
        };
    });

    return {
        tools: [
            ...augmentedTools,
            {
                name: "read_document",
                description: "Reads the current state of a Denicek document.",
                inputSchema: {
                    type: "object",
                    properties: {
                        docId: { type: "string", description: "The Automerge URL or ID of the document." }
                    },
                    required: ["docId"]
                }
            }
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    if (name === "read_document") {
        const argObj = (args && typeof args === "object") ? (args as Record<string, unknown>) : null;
        const docId = typeof argObj?.docId === "string" ? argObj.docId : undefined;
        if (!docId) throw new Error("docId is required");
        const handle = await getDoc(docId);
        const doc = await handle.doc();
        if (!doc) throw new Error("Document not found");
        return {
            content: [{
                type: "text",
                text: serializeDocument(doc)
            }]
        };
    }

    type DenicekTool = (typeof DENICEK_TOOLS)[number];
    const toolDef = DENICEK_TOOLS.find((t: DenicekTool) => t.function.name === name);
    if (!toolDef) {
        throw new Error(`Unknown tool: ${name}`);
    }

    const argObj = (args && typeof args === "object") ? (args as Record<string, unknown>) : null;
    const docId = typeof argObj?.docId === "string" ? argObj.docId : undefined;
    if (!docId) {
        return {
            content: [{ type: "text", text: "Error: 'docId' argument is required for this tool." }],
            isError: true
        };
    }

    const handle = await getDoc(docId);
    
    try {
        const result = await executeToolAction(handle, name as DenicekToolName, args);
        return {
            content: [{ type: "text", text: result }]
        };
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return {
            content: [{ type: "text", text: `Error executing tool: ${message}` }],
            isError: true
        };
    }
});


const transport = new StdioServerTransport();
await server.connect(transport);
