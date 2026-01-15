import { Card, CardHeader, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text } from "@fluentui/react-components";
import { type DenicekAction } from "@mydenicek/react-v2";
import { ShortenedId } from "./components/ShortenedId";

// Check if a path segment looks like a Loro OpId (peer@counter format)
function isNodeId(segment: string): boolean {
    return /^\d+@\d+$/.test(segment);
}

// Extract the node ID from a path (e.g., ["nodes", "321@18100", "tag"] -> "321@18100")
function extractNodeId(path: (string | number)[]): string | null {
    for (const segment of path) {
        const str = String(segment);
        if (isNodeId(str)) {
            return str;
        }
    }
    return null;
}


export function RecordedScriptView({ script, onNodeClick }: { script: DenicekAction[], onNodeClick?: ((id: string) => void) | undefined }) {
    if (!script || script.length === 0) {
        return (
            <Card>
                <CardHeader header={<Text>Recorded Script</Text>} />
                <Text style={{ padding: 12, fontStyle: 'italic', color: '#666' }}>
                    No actions recorded yet. Perform actions on the document to record them.
                </Text>
            </Card>
        );
    }

    return (
        <Card style={{ overflow: 'hidden' }}>
            <CardHeader header={<Text>Recorded Script</Text>} />
            <div style={{ overflowX: 'auto' }}>
                <Table size="small">
                    <TableHeader>
                        <TableRow>
                            <TableHeaderCell style={{ width: '60px' }}>Action</TableHeaderCell>
                            <TableHeaderCell style={{ width: '120px' }}>Node</TableHeaderCell>
                            <TableHeaderCell>Value</TableHeaderCell>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {script.map((patch, i) => {
                            const nodeId = extractNodeId(patch.path);
                            const value = (patch as any).value ?? (patch as any).values;

                            return (
                                <TableRow key={i}>
                                    <TableCell style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {patch.action}
                                    </TableCell>
                                    <TableCell>
                                        {nodeId ? (
                                            <ShortenedId id={nodeId} onClick={onNodeClick} maxLength={14} />
                                        ) : (
                                            <span style={{ color: '#999' }}>-</span>
                                        )}
                                    </TableCell>
                                    <TableCell style={{ wordBreak: 'break-word' }}>
                                        {value !== undefined ? (
                                            <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                                                {JSON.stringify(value)}
                                            </span>
                                        ) : (
                                            <span style={{ color: '#999' }}>-</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </Card>
    );
};
