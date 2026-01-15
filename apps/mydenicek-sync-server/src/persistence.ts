/**
 * Document persistence layer for the sync server
 * 
 * Stores Loro document snapshots to the filesystem.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

let persistenceDir: string | null = null;

/**
 * Initialize the persistence directory
 */
export function initPersistence(path: string): void {
    persistenceDir = path;
    if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
    }
}

/**
 * Get the file path for a room
 */
function getRoomPath(roomId: string): string {
    if (!persistenceDir) {
        throw new Error("Persistence not initialized");
    }
    // Sanitize roomId to prevent directory traversal
    const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(persistenceDir, `${safeRoomId}.loro`);
}

/**
 * Load a document from disk
 */
export function loadDocument(roomId: string): Uint8Array | null {
    try {
        const path = getRoomPath(roomId);
        if (existsSync(path)) {
            const buffer = readFileSync(path);
            return new Uint8Array(buffer);
        }
    } catch (error) {
        console.error(`Error loading document ${roomId}:`, error);
    }
    return null;
}

/**
 * Save a document to disk
 */
export async function saveDocument(roomId: string, data: Uint8Array): Promise<void> {
    try {
        const path = getRoomPath(roomId);
        writeFileSync(path, Buffer.from(data));
    } catch (error) {
        console.error(`Error saving document ${roomId}:`, error);
    }
}
