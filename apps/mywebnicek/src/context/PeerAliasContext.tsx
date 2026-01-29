import { createContext, type ReactNode, useContext, useMemo } from "react";

interface PeerAliasContextValue {
    selfPeerId: string | null;
    getAlias: (peerId: string) => string;
    formatNodeId: (nodeId: string) => string;
    formatValue: (value: unknown) => unknown;
}

const PeerAliasContext = createContext<PeerAliasContextValue | null>(null);

// Extract peer ID from node ID (format: counter@peer)
export function extractPeerId(nodeId: string): string | null {
    const atIndex = nodeId.indexOf('@');
    if (atIndex === -1) return null;
    return nodeId.slice(atIndex + 1);
}

interface PeerAliasProviderProps {
    children: ReactNode;
    selfPeerId: string | null;
    knownPeerIds?: string[];
    peerNames?: Record<string, string>;
}

export function PeerAliasProvider({ children, selfPeerId, knownPeerIds = [], peerNames = {} }: PeerAliasProviderProps) {
    const value = useMemo(() => {
        // Build alias map
        const aliasMap = new Map<string, string>();
        let peerCounter = 1;

        // Self always gets their name or "You"
        if (selfPeerId) {
            const selfName = peerNames[selfPeerId];
            aliasMap.set(selfPeerId, selfName || "You");
        }

        // Assign aliases to other known peers
        for (const peerId of knownPeerIds) {
            if (!aliasMap.has(peerId)) {
                const name = peerNames[peerId];
                aliasMap.set(peerId, name || `peer${peerCounter++}`);
            }
        }

        const getAlias = (peerId: string): string => {
            if (aliasMap.has(peerId)) {
                return aliasMap.get(peerId)!;
            }
            // Check peerNames for unknown peers
            const name = peerNames[peerId];
            if (name) {
                aliasMap.set(peerId, name);
                return name;
            }
            // Assign a new alias for unknown peers - use "Peer N", NOT self's name
            const alias = peerId === selfPeerId ? (peerNames[selfPeerId] || "You") : `Peer ${peerCounter++}`;
            aliasMap.set(peerId, alias);
            return alias;
        };

        const formatNodeId = (nodeId: string): string => {
            const atIndex = nodeId.indexOf('@');
            if (atIndex === -1) return nodeId;

            const counter = nodeId.slice(0, atIndex);
            const peerId = nodeId.slice(atIndex + 1);
            const alias = getAlias(peerId);

            return `${counter}@${alias}`;
        };

        // Recursively format values that might contain node IDs
        const formatValue = (value: unknown): unknown => {
            if (typeof value === 'string') {
                // Check if it looks like a node ID
                if (/^\d+@\d+$/.test(value)) {
                    return formatNodeId(value);
                }
                return value;
            }
            if (Array.isArray(value)) {
                return value.map(formatValue);
            }
            if (value && typeof value === 'object') {
                const result: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(value)) {
                    result[k] = formatValue(v);
                }
                return result;
            }
            return value;
        };

        return {
            selfPeerId,
            getAlias,
            formatNodeId,
            formatValue,
        };
    }, [selfPeerId, knownPeerIds, peerNames]);

    return (
        <PeerAliasContext.Provider value={value}>
            {children}
        </PeerAliasContext.Provider>
    );
}

export function usePeerAlias() {
    const context = useContext(PeerAliasContext);
    if (!context) {
        // Return default implementation if not in provider
        return {
            selfPeerId: null,
            getAlias: (peerId: string) => peerId,
            formatNodeId: (nodeId: string) => nodeId,
            formatValue: (value: unknown) => value,
        };
    }
    return context;
}
