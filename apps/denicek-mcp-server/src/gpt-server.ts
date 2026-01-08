import type { AnyDocumentId } from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import { type JsonDoc } from "@mydenicek/core";
import { DENICEK_TOOLS, serializeDocument } from "@mydenicek/mcp";
import cors from "cors";
import express from "express";
import { executeToolAction, type DenicekToolName } from "./executor.js";

// Hack for WebSocket in Node environment
import WebSocket from "isomorphic-ws";
// @ts-ignore
global.WebSocket = WebSocket;

type DenicekTool = (typeof DENICEK_TOOLS)[number];

const repo = new Repo({
    network: [new BrowserWebSocketClientAdapter("wss://sync.automerge.org")],
    storage: new NodeFSStorageAdapter(".automerge-data")
});

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// Helper to get doc handle
async function getDoc(docId: string) {
    const handle = repo.find<JsonDoc>(docId as unknown as AnyDocumentId);
    await handle.whenReady();
    return handle;
}

// 1. Generate OpenAPI Spec dynamically
app.get("/openapi.json", (req, res) => {
    type UnknownRecord = Record<string, unknown>;
    const paths: UnknownRecord = {
        "/read_document": {
            post: {
                operationId: "read_document",
                summary: "Reads the current state of a Denicek document.",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    docId: { type: "string" }
                                },
                                required: ["docId"]
                            }
                        }
                    }
                },
                responses: {
                    "200": {
                        description: "Document content in XML format",
                        content: { "application/json": { schema: { type: "object" } } }
                    }
                }
            }
        }
    };

    DENICEK_TOOLS.forEach((tool: DenicekTool) => {
        const schema = structuredClone(tool.function.parameters) as unknown;
        if (schema && typeof schema === "object" && (schema as UnknownRecord).type === "object") {
            const obj = schema as UnknownRecord;
            const properties = (obj.properties && typeof obj.properties === "object") ? (obj.properties as UnknownRecord) : {};
            properties["docId"] = { type: "string", description: "The Automerge URL or UUID of the document." };
            obj.properties = properties;
            const required = Array.isArray(obj.required) ? (obj.required as unknown[]) : [];
            if (!required.includes("docId")) required.push("docId");
            obj.required = required;
        }

        paths[`/tools/${tool.function.name}`] = {
            post: {
                operationId: tool.function.name,
                summary: tool.function.description,
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: schema
                        }
                    }
                },
                responses: {
                    "200": {
                        description: "Action result",
                        content: { "application/json": { schema: { type: "object" } } }
                    }
                }
            }
        };
    });

    const spec = {
        openapi: "3.1.0",
        info: {
            title: "MyDenicek API",
            description: "API for editing MyDenicek documents via Automerge",
            version: "1.0.0"
        },
        servers: [
            { url: "https://your-public-url.ngrok-free.app" } // User must update this
        ],
        paths: paths,
        components: {
            schemas: {}
        }
    };

    res.json(spec);
});

// 2. Read Document Endpoint
app.post("/read_document", async (req, res) => {
    try {
        const body: unknown = req.body;
        const docId = (body && typeof body === "object") ? (body as Record<string, unknown>).docId : undefined;
        if (typeof docId !== "string" || docId.length === 0) throw new Error("docId is required");
        
        const handle = await getDoc(docId);
        const doc = await handle.doc();
        if (!doc) throw new Error("Document not found");
        res.json({ content: serializeDocument(doc) });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: message });
    }
});

// 3. Tool Execution Endpoints
DENICEK_TOOLS.forEach((tool: DenicekTool) => {
    app.post(`/tools/${tool.function.name}`, async (req, res) => {
        try {
            const body: unknown = req.body;
            const docId = (body && typeof body === "object") ? (body as Record<string, unknown>).docId : undefined;
            if (typeof docId !== "string" || docId.length === 0) throw new Error("docId is required");

            const handle = await getDoc(docId);
            const result = await executeToolAction(handle, tool.function.name as DenicekToolName, req.body);
            res.json({ message: result });
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            res.status(500).json({ error: message });
        }
    });
});

app.listen(PORT, () => {
    console.log(`ChatGPT Bridge Server running at http://localhost:${PORT}`);
    console.log(`OpenAPI Spec available at http://localhost:${PORT}/openapi.json`);
});
