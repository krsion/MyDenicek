import { Card, CardHeader, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text } from "@fluentui/react-components";
import { type GeneralizedPatch } from "@mydenicek/core";

export const RecordedScriptView = ({ script }: { script: GeneralizedPatch[] }) => {
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
        <Card>
            <CardHeader header={<Text>Recorded Script</Text>} />
            <Table size="small">
                <TableHeader>
                    <TableRow>
                        <TableHeaderCell>Action</TableHeaderCell>
                        <TableHeaderCell>Path</TableHeaderCell>
                        <TableHeaderCell>Value</TableHeaderCell>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {script.map((patch, i) => (
                        <TableRow key={i}>
                            <TableCell>{patch.action}</TableCell>
                            <TableCell>{patch.path.join('/')}</TableCell>
                            <TableCell>
                                <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                                    {JSON.stringify((patch as any).value || (patch as any).values)}
                                </span>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Card>
    );
};
