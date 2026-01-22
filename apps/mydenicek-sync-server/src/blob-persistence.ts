/**
 * Azure Blob Storage persistence layer for the sync server
 *
 * Stores Loro document snapshots to Azure Blob Storage.
 */

import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";

let containerClient: ContainerClient | null = null;

/**
 * Initialize Azure Blob Storage connection
 */
export async function initBlobPersistence(
    connectionString: string,
    containerName: string = "loro-documents"
): Promise<void> {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    containerClient = blobServiceClient.getContainerClient(containerName);

    // Create container if it doesn't exist
    await containerClient.createIfNotExists();
}

/**
 * Get the blob name for a room (sanitized)
 */
function getBlobName(roomId: string): string {
    // Sanitize roomId to prevent issues - same logic as file persistence
    const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${safeRoomId}.loro`;
}

/**
 * Load a document from Azure Blob Storage
 */
export async function loadDocument(roomId: string): Promise<Uint8Array | null> {
    if (!containerClient) {
        throw new Error("Blob persistence not initialized");
    }

    try {
        const blobClient = containerClient.getBlobClient(getBlobName(roomId));
        const exists = await blobClient.exists();

        if (!exists) {
            return null;
        }

        const downloadResponse = await blobClient.download(0);
        const body = downloadResponse.readableStreamBody;

        if (!body) {
            return null;
        }

        // Convert stream to Uint8Array
        const chunks: Buffer[] = [];
        for await (const chunk of body) {
            chunks.push(Buffer.from(chunk));
        }
        return new Uint8Array(Buffer.concat(chunks));
    } catch (error) {
        console.error(`Error loading document ${roomId} from blob:`, error);
        return null;
    }
}

/**
 * Save a document to Azure Blob Storage
 */
export async function saveDocument(roomId: string, data: Uint8Array): Promise<void> {
    if (!containerClient) {
        throw new Error("Blob persistence not initialized");
    }

    try {
        const blockBlobClient = containerClient.getBlockBlobClient(getBlobName(roomId));
        await blockBlobClient.upload(data, data.length, {
            blobHTTPHeaders: {
                blobContentType: "application/octet-stream"
            }
        });
    } catch (error) {
        console.error(`Error saving document ${roomId} to blob:`, error);
        throw error;
    }
}
